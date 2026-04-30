FROM mcr.microsoft.com/devcontainers/dotnet:2-10.0-noble

RUN apt-get update && apt-get install -y --no-install-recommends xdg-utils
USER vscode

RUN curl -fsSL https://vite.plus | bash
RUN curl -fsSL https://mise.run | sh \
    && echo 'eval "$(mise activate bash)"' >> ~/.bashrc \
    && echo 'eval "$(mise activate zsh)"' >> "${ZDOTDIR-$HOME}/.zshrc"

ENV PATH="/home/vscode/.vite-plus/bin:/home/vscode/.local/bin:${PATH}"
RUN mise use -g node@latest pnpm@latest bun@latest
RUN mise use -g opencode@latest "npm:btca@latest"
COPY mise.toml /tmp/mise.toml
RUN cd /tmp && mise trust && mise install -y
