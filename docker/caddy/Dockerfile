FROM caddy:builder AS builder
ENV GOPROXY=https://goproxy.io,direct
ENV GONOSUMDB=*
RUN xcaddy build \
    --with github.com/caddy-dns/cloudflare \
    --with github.com/mholt/caddy-l4

FROM caddy:latest
COPY --from=builder /usr/bin/caddy /usr/bin/caddy
