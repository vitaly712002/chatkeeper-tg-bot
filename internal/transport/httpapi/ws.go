package httpapi

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

const (
	writeWait      = 10 * time.Second
	pongWait       = 60 * time.Second
	pingPeriod     = (pongWait * 9) / 10
	maxMessageSize = 1024
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true // Разрешаем подключение с веб-панели
	},
}

// Hub хранит активные WebSocket-клиенты и рассылает события.
type Hub struct {
	clients    map[*Client]bool
	broadcast  chan []byte
	register   chan *Client
	unregister chan *Client
	log        *slog.Logger
	mu         sync.Mutex
}

// NewHub создаёт новый экземпляр Hub.
func NewHub(log *slog.Logger) *Hub {
	return &Hub{
		broadcast:  make(chan []byte, 256),
		register:   make(chan *Client),
		unregister: make(chan *Client),
		clients:    make(map[*Client]bool),
		log:        log,
	}
}

// Run запускает цикл обработки регистрации и рассылки сообщений.
func (h *Hub) Run(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			h.mu.Lock()
			for client := range h.clients {
				close(client.send)
				_ = client.conn.Close()
				delete(h.clients, client)
			}
			h.mu.Unlock()
			return

		case client := <-h.register:
			h.mu.Lock()
			h.clients[client] = true
			total := len(h.clients)
			h.mu.Unlock()
			h.log.Info("ws клиент подключен", "total", total)

		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.send)
			}
			total := len(h.clients)
			h.mu.Unlock()
			h.log.Info("ws клиент отключен", "total", total)

		case message := <-h.broadcast:
			h.mu.Lock()
			for client := range h.clients {
				select {
				case client.send <- message:
				default:
					close(client.send)
					delete(h.clients, client)
				}
			}
			h.mu.Unlock()
		}
	}
}

// Event — структура рассылаемого события.
type Event struct {
	Type string `json:"type"`
	Data any    `json:"data"`
}

// Broadcast сериализует и отправляет событие всем подключённым клиентам.
func (h *Hub) Broadcast(eventType string, data any) {
	if h == nil {
		return
	}
	payload, err := json.Marshal(Event{Type: eventType, Data: data})
	if err != nil {
		h.log.Error("ошибка маршалинга ws события", "type", eventType, "err", err)
		return
	}
	select {
	case h.broadcast <- payload:
	default:
		h.log.Warn("ws broadcast канал переполнен, сообщение пропущено", "type", eventType)
	}
}

// Client — отдельное WebSocket соединение.
type Client struct {
	hub  *Hub
	conn *websocket.Conn
	send chan []byte
}

func (c *Client) readPump() {
	defer func() {
		c.hub.unregister <- c
		_ = c.conn.Close()
	}()
	c.conn.SetReadLimit(maxMessageSize)
	_ = c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		_ = c.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})
	for {
		_, msg, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				c.hub.log.Debug("ws read error", "err", err)
			}
			break
		}
		// Простая обработка текстового пинга от клиента
		if strings.TrimSpace(string(msg)) == "ping" {
			select {
			case c.send <- []byte(`{"type":"pong"}`):
			default:
			}
		}
	}
}

func (c *Client) writePump(ctx context.Context) {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		_ = c.conn.Close()
	}()
	for {
		select {
		case <-ctx.Done():
			_ = c.conn.WriteMessage(websocket.CloseMessage, []byte{})
			return
		case message, ok := <-c.send:
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				_ = c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			w, err := c.conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			_, _ = w.Write(message)

			// Если в очереди есть еще сообщения, запишем их в текущий фрейм через \n
			n := len(c.send)
			for i := 0; i < n; i++ {
				_, _ = w.Write([]byte{'\n'})
				_, _ = w.Write(<-c.send)
			}

			if err := w.Close(); err != nil {
				return
			}
		case <-ticker.C:
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// handleWebSocket обрабатывает подключение к WebSocket по адресу /api/ws.
func (s *Server) handleWebSocket(w http.ResponseWriter, r *http.Request) {
	token := r.URL.Query().Get("token")
	if token == "" {
		authHeader := r.Header.Get("Authorization")
		if strings.HasPrefix(authHeader, "Bearer ") {
			token = strings.TrimPrefix(authHeader, "Bearer ")
		}
	}

	if token == "" || !s.verifyToken(token) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	if s.hub == nil {
		http.Error(w, "WebSocket Hub not available", http.StatusServiceUnavailable)
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		s.log.Error("ошибка websocket upgrade", "err", err)
		return
	}

	client := &Client{hub: s.hub, conn: conn, send: make(chan []byte, 256)}
	s.hub.register <- client

	go client.writePump(r.Context())
	go client.readPump()
}
