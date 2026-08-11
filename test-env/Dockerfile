# The "server" — nginx-rtmp and the backend in one container.
#
# They are co-resident on purpose. The backend writes nginx.conf and shells out
# to `nginx -t` / `nginx -s reload`, so it needs the same filesystem and process
# space as nginx. That is also how production is laid out (deploy/setup.sh), so
# this mirrors the real topology instead of inventing a different one.
#
# The apt list tracks deploy/setup.sh — keep them in sync so the test
# environment and the real host drift together, not apart.
FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update -qq && apt-get install -y -qq --no-install-recommends \
        nginx-full \
        libnginx-mod-rtmp \
        python3 \
        python3-pip \
        curl \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Ubuntu auto-loads the rtmp module via modules-enabled. The generated config
# has its own `load_module` line (needed on 24.04, see f7a7aee), and loading it
# twice is a fatal error — so drop the distro's copy.
RUN rm -f /etc/nginx/modules-enabled/*rtmp*

COPY backend/requirements.txt /tmp/requirements.txt
RUN pip3 install --no-cache-dir --break-system-packages -r /tmp/requirements.txt

COPY test-env/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

WORKDIR /app/backend
EXPOSE 1935 8000 8080

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
