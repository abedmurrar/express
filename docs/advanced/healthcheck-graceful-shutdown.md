---
title: Health Checks and Graceful Shutdown
description: Learn how to implement health checks and graceful shutdown in Express apps to enhance reliability, manage deployments, and integrate with load balancers like Kubernetes.
---

# Health Checks and Graceful Shutdown

## Graceful shutdown

When you deploy a new version of your application, you must replace the previous version. The process manager you're using will first send a SIGTERM signal to the application to notify it that it will be killed. Once the application gets this signal, it should stop accepting new requests, finish all the ongoing requests, clean up the resources it used, including database connections and file locks then exit.

### Why `server.close()` isn't enough

`app.listen()` returns a Node.js [`http.Server`](https://nodejs.org/api/http.html#class-httpserver), and its `close()` method stops new connections, closes the idle ones and calls back when the rest have ended. On its own it has three problems, each seen in a run on Node.js 22 and 24:

- **It can cut off a response.** A connection counts as idle once the response has been ended, even when Node.js is still writing it out. In that run, a slow client got 9 MB of a 40 MB `res.send()`.
- **It waits for kept-alive connections.** A connection that was answering a request when `close()` was called stays open afterwards. It is closed 5 seconds (`server.keepAliveTimeout`) after its last response, and until then the client can send more requests on it, which are answered.
- **It has no time limit.** A request that never ends, such as a stream of server-sent events, keeps the process running until something kills it.

And a load balancer that doesn't know yet that this instance is stopping still opens connections to it, which are refused.

### Recipe

1. Answer the readiness check with `503`, so the load balancer stops sending requests. Keep answering them until it has seen that, with `Connection: close` so that clients open their next connection to another instance.
2. Wait for the responses in progress.
3. Call `server.close()`.
4. Close what the app opened, such as database pools, and let the process exit by itself.
5. After a time limit, call `server.closeAllConnections()` to cut off what is left. Set it below the time the process manager waits before it sends SIGKILL (30 seconds by default on Kubernetes).

<<< ../../examples/graceful-shutdown/index.js

The example is in [examples/graceful-shutdown](https://github.com/abedmurrar/express/tree/master/examples/graceful-shutdown), where `../..` is this repository. In your app it is `express`. Run it, ask for `/slow`, and send the process a SIGTERM: the response arrives whole, and the process exits with code 0.

Things to know:

- A response that stays open on purpose, such as server-sent events, is cut off at the time limit. End those yourself when `stop()` is called. A handler can tell a connection that was cut off with [`req.signal`](/api/request#reqsignal).
- WebSockets and other upgraded connections aren't the HTTP server's any more: `server.closeAllConnections()` leaves them open, so close them yourself.
- The signal has to reach Node.js. Start the process with `node`, not with a script or a shell that doesn't pass signals on.
- Windows has no SIGTERM to handle: ending the process there ends it at once.

## Health checks

A load balancer uses health checks to determine if an application instance is healthy and can accept requests. For example, [Kubernetes has two health checks](https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes//):

- `liveness`, that determines when to restart a container.
- `readiness`, that determines when a container is ready to start accepting traffic. When a pod is not ready, it is removed from the service load balancers.

Answer them with two routes, as the [example above](#recipe) does:

- Liveness (`/livez`) answers `200` while the process works, also while it is stopping. Don't make it depend on the database or on other services: a restart doesn't fix those.
- Readiness (`/readyz`) answers `200`, and `503` once the app is stopping.

Both come before any authentication and rate limiting.
