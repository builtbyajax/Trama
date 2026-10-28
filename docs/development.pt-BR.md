# Guia de desenvolvimento

Este guia explica como configurar o ambiente, executar o Trama pelo código-fonte, isolar os dados de desenvolvimento e verificar mudanças.

## Pré-requisitos

- Node.js **22.12 ou superior**
- Rust **1.90 ou superior**
- Os [pré-requisitos do Tauri](https://v2.tauri.app/start/prerequisites/) para seu sistema
- Git para os recursos de repositório
- O [GitHub CLI](https://cli.github.com/), instalado e autenticado, para consultar pull requests

## Instalar e executar

A partir da raiz do repositório:

```sh
cd app
npm ci
npm run tauri dev
```

Para abrir a interface de desenvolvimento no navegador, execute `npm run dev` dentro de `app/`. Ela se conecta ao mesmo núcleo Rust por uma ponte local em `http://127.0.0.1:1420`.

## Dados de desenvolvimento

Por padrão, os comandos de desenvolvimento usam `.trama-local/development/` na raiz do repositório. Assim, os bancos de desenvolvimento ficam separados dos dados do aplicativo instalado.

Defina `TRAMA_HOME` ou `TRAMA_DB` para escolher outro local. Por exemplo, dentro de `app/`:

```sh
TRAMA_DB=/caminho/para/trama-desenvolvimento.sqlite npm run tauri dev
```

`TRAMA_DEV_PERSONAL=1` usa os dados do aplicativo instalado e pode migrá-los. Use essa opção apenas se quiser trabalhar com esses dados e aceitar o risco da migração. Não a use no desenvolvimento ou nos testes de rotina.

## Compilar o aplicativo

Dentro de `app/`:

```sh
npm run tauri build
```

O resultado fica em `app/src-tauri/target/release/bundle/` e inclui o servidor MCP local. Assinatura e distribuição de releases são etapas separadas da compilação local.

## Executar verificações antes de enviar mudanças

Execute estes comandos dentro de `app/`:

```sh
npm run typecheck
npm run format:check
npm test
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-targets --features agent-cli,dev-bridge -- -D warnings
cargo test --locked --manifest-path src-tauri/Cargo.toml --features agent-cli,dev-bridge
npm run build
```

Consulte [Testes e CI](testing.md) para conhecer a cobertura, os testes de navegador e os detalhes do GitHub Actions.
