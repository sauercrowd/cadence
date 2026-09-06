package main

import (
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/sauercrowd/worker/gen/worker/v1/workerv1connect"
	"github.com/sauercrowd/worker/internal/server"
	workerweb "github.com/sauercrowd/worker/internal/web"
	"github.com/sauercrowd/worker/internal/workspace"
)

func main() {
	address := flag.String("addr", "127.0.0.1:7331", "address to listen on")
	flag.Parse()

	projectRoot := "."
	if flag.NArg() > 0 {
		projectRoot = flag.Arg(0)
	}
	store, err := workspace.NewStore(projectRoot)
	if err != nil {
		log.Fatal(err)
	}

	api := http.NewServeMux()
	servicePath, serviceHandler := workerv1connect.NewWorkspaceServiceHandler(server.NewHandler(store))
	api.Handle(servicePath, serviceHandler)

	mux := http.NewServeMux()
	mux.Handle("/api/", http.StripPrefix("/api", api))
	mux.Handle("/", workerweb.Handler())

	httpServer := &http.Server{
		Addr:              *address,
		Handler:           requestLogger(mux),
		ReadHeaderTimeout: 5 * time.Second,
		IdleTimeout:       90 * time.Second,
	}

	log.Printf("Cadence is serving %s at http://%s", store.Root(), *address)
	if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
}

func requestLogger(next http.Handler) http.Handler {
	logger := log.New(os.Stderr, "", log.LstdFlags)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		started := time.Now()
		next.ServeHTTP(w, r)
		if r.URL.Path != "/" {
			logger.Printf("%s %s %s", r.Method, r.URL.Path, time.Since(started).Round(time.Millisecond))
		}
	})
}

func init() {
	flag.Usage = func() {
		_, _ = fmt.Fprintln(flag.CommandLine.Output(), "Usage: cadence [flags] [project-directory]")
		flag.PrintDefaults()
	}
}
