# Artalk v2.10.0, with a mail-only compatibility fix. Keep the upstream UI/version.
FROM golang:1.26-alpine AS build
ENV GOPROXY=https://goproxy.cn,direct
WORKDIR /source
ADD --checksum=sha256:9f27c447ebd5c980c2840dfbdac1853717ef8c77cfc9a39d405149a8db34513f https://codeload.github.com/ArtalkJS/Artalk/tar.gz/1bf21404bd618d61bc336d0618f82de4872d6d74 /tmp/source.tar.gz
ADD --checksum=sha256:6e6b5456a3265e29cecb36b7d935dbafb6639035e2681901123b6b150e307379 https://github.com/ArtalkJS/Artalk/releases/download/v2.10.0/artalk_ui.tar.gz /tmp/ui.tar.gz
RUN tar xzf /tmp/source.tar.gz --strip-components=1 && tar xzf /tmp/ui.tar.gz --strip-components=1 -C public
COPY patches/email_emoticons*.go internal/template/
RUN sed -i 's/return renderCommon(tpl, p)/return inlineEmailEmoticons(renderCommon(tpl, p))/' internal/template/render_email.go
RUN --mount=type=cache,target=/go/pkg/mod --mount=type=cache,target=/root/.cache/go-build \
    go test ./internal/template -run TestEmailEmoticons -count=1 && \
    CGO_ENABLED=0 go build -trimpath -ldflags='-s -w -X github.com/artalkjs/artalk/v2/internal/config.Version=v2.10.0 -X github.com/artalkjs/artalk/v2/internal/config.buildCommitHash=1bf2140-mail1' -o /out/artalk .
FROM artalk/artalk-go@sha256:ed51450f3ed744780efd0d796f1ea033063bb11543973439b9c57ed32ac9b78f
COPY --from=build /out/artalk /artalk
