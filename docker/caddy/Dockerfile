FROM caddy:builder AS builder
ENV GOPROXY=https://goproxy.io,direct
ENV GONOSUMDB=*
RUN xcaddy build \
    --with github.com/caddy-dns/bunny
    # caddy-l4 убран — панель не делит порт с Xray, мультиплексировать нечего
FROM caddy:latest
COPY --from=builder /usr/bin/caddy /usr/bin/caddy
