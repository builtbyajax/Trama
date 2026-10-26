<p align="center">
  <a href="README.md">English</a> &nbsp;·&nbsp; <strong>Português brasileiro</strong>
</p>

<p align="center">
  <img src="docs/images/pt-BR/cover.svg" alt="Trama — Planeje. Construa. Revise." width="100%">
</p>

<p align="center">
  <strong>Um espaço local para trabalhar com agentes de código.</strong><br>
  Reúna o plano, o histórico do código e o contexto, do briefing à revisão.
</p>

<p align="center">
  <a href="https://trama.ajaxdev.com.br/pt/">Site de apresentação</a> &nbsp;·&nbsp;
  <a href="#primeiros-passos">Primeiros passos</a> &nbsp;·&nbsp;
  <a href="docs/installation.pt-BR.md">Instalação e configuração do MCP</a> &nbsp;·&nbsp;
  <a href="#desenvolvimento">Executar pelo código-fonte</a>
</p>

![Quadro do Trama com tarefas atribuídas à pessoa ou ao agente em quatro colunas](docs/images/pt-BR/board.png)

## O próximo passo está claro

Escreva o briefing, anexe o contexto e coloque a tarefa na fila do agente. O Trama mostra com quem está o trabalho, o que está em andamento e o que precisa da sua revisão. Seu agente de código trabalha no próprio cliente e lê e atualiza o quadro pelo MCP.

**Quadro, Git e notas fazem parte do mesmo projeto.** Cada tarefa pode reunir briefing, conversa, verificações, resumo do agente, notas anexadas e referências da entrega, para que a revisão venha acompanhada do contexto necessário.

## Primeiros passos

O Trama está em desenvolvimento inicial. Os instaladores ainda não foram publicados; por enquanto, você pode [executar pelo código-fonte](#desenvolvimento). O canal de download planejado é o GitHub Releases, com um `.dmg` para macOS e um `.exe` para Windows.

A interface está disponível em inglês e português brasileiro. Escolha o idioma em **Preferências → Idioma**. As capturas mostram a interface real com dados de demonstração.

## Um quadro para você e seus agentes

Mova o trabalho por **A fazer → Em andamento → Para revisar → Concluído**. Atribua tarefas a você ou ao agente, organize-as por categorias e branches locais e mantenha as ideias em preparação nos rascunhos.

- Arraste cartões ou mova-os pelo teclado.
- Consulte a atividade e o resumo da entrega antes de revisar.
- Mantenha anotações pessoais da tarefa privadas para os clientes MCP.
- Arquive o trabalho concluído e restaure-o quando precisar.
- Veja na visão geral onde o trabalho está parado entre seus projetos.

## Acompanhe o trabalho no Git

Consulte alterações locais, branches, commits e tarefas vinculadas em um único histórico. Abra diferenças entre arquivos lado a lado ou em linha, veja os detalhes de cada commit e consulte pull requests pelo GitHub CLI.

A visualização de Git do Trama é somente para consulta. Você e suas ferramentas de código continuam controlando commits, branches e merges.

![Histórico Git do Trama com os commits de uma tarefa, o estado da entrega e os arquivos alterados](docs/images/pt-BR/git.png)

## Mantenha o contexto em Markdown

Vincule o projeto a uma pasta de arquivos Markdown. Navegue e busque no cofre, abra notas em abas e edite com ferramentas de formatação e prévia ao vivo. Anexe as notas relevantes às tarefas para que o agente possa consultar o mesmo contexto.

Suas notas continuam sendo arquivos `.md` comuns, na pasta que você escolheu. O Trama verifica alterações externas antes de salvar.

![Notas do Trama com árvore de arquivos, tarefas vinculadas e um briefing em Markdown](docs/images/pt-BR/notes.png)

## Conecte seu agente de código

O pacote do aplicativo inclui o **`trama-agent`**, um servidor MCP local por STDIO. Conecte-o ao Codex, Claude Code, OpenCode ou outro cliente que aceite servidores MCP locais.

O agente pode ler briefings, atualizar tarefas, registrar referências da entrega e trabalhar com as notas do projeto. As anotações privadas das tarefas ficam fora das suas ferramentas. O Trama não inicia nem hospeda agentes de código.

1. Instale ou compile o Trama.
2. [Conecte seu cliente MCP](docs/installation.pt-BR.md#conecte-seu-agente).
3. Adicione a [skill do Trama](skills/trama/SKILL.md) para ensinar ao agente o fluxo de fila, entrega e revisão.

## Seu espaço de trabalho fica local

| Dados | Onde ficam |
| --- | --- |
| Projetos, tarefas e atividade | Em um banco SQLite local |
| Notas do projeto | Na pasta Markdown que você escolheu |
| Código e histórico Git | Nos seus repositórios locais existentes |

O Trama não tem conta nem sincronização com a nuvem. O acesso do agente aos dados segue as regras do cliente e do provedor que você usa; conectá-lo por MCP permite que ele leia o contexto do projeto exposto pelo Trama.

Consulte os caminhos do banco de dados no [guia de instalação](docs/installation.pt-BR.md#dados-locais).

## Suporte e sugestões

Encontrou um problema ou tem uma ideia para o Trama? [Reporte um bug](https://github.com/builtbyajax/Trama/issues/new?template=bug_report.yml) ou [sugira uma melhoria](https://github.com/builtbyajax/Trama/issues/new?template=feature_request.yml). Você pode escrever em português ou inglês. Remova informações privadas de capturas de tela e logs antes de compartilhá-los.

## Desenvolvimento

Feito com **Tauri 2, React, TypeScript e Rust**, com SQLite para armazenamento local.

Você precisa de Node.js **22.12+**, Rust **1.90+** e dos [pré-requisitos do Tauri](https://v2.tauri.app/start/prerequisites/) para seu sistema. O Git habilita os recursos de repositório; o [GitHub CLI](https://cli.github.com/) instalado e autenticado permite consultar pull requests.

A partir da raiz do repositório:

```sh
cd app
npm ci
npm run tauri dev
```

Para abrir a interface de desenvolvimento no navegador, use `npm run dev`. Ela se conecta ao mesmo núcleo Rust por uma ponte local em `http://127.0.0.1:1420`.

Os comandos de desenvolvimento usam `.trama-local/development` para os dados por padrão, evitando que mudanças de schema migrem os bancos do app instalado. `TRAMA_HOME` ou `TRAMA_DB` explícitos selecionam outro local. Use `TRAMA_DEV_PERSONAL=1` somente quando quiser usar e possivelmente migrar seus dados pessoais.

Para gerar o pacote do aplicativo no seu sistema:

```sh
npm run tauri build
```

O resultado fica em `app/src-tauri/target/release/bundle/` e inclui o servidor MCP. A assinatura e a distribuição de releases são etapas separadas da compilação local.

Antes de enviar mudanças, execute estas verificações a partir de `app/`:

```sh
npm run typecheck
npm run format:check
npm test
cargo test --locked --manifest-path src-tauri/Cargo.toml --features agent-cli,dev-bridge
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --features agent-cli,dev-bridge -- -D warnings
```

Use `TRAMA_DB` para apontar uma sessão de desenvolvimento para um banco separado.

[Testes e CI](docs/testing.md)

<details>
<summary>Atalhos de teclado</summary>

Use ⌘ no macOS e Ctrl no Windows. As abas do projeto usam ⌃ no macOS e Alt no Windows.

| Atalho no macOS | Ação |
| --- | --- |
| `⌘N` | Nova tarefa |
| `⇧⌘N` | Novo projeto |
| `⌘K` | Buscar |
| `⌘1…9` | Trocar de projeto |
| `⌘T` | Encontrar um projeto pelo nome |
| `⌥⌘1` / `⌥⌘2` / `⌥⌘3` | Visão geral / Rascunhos / Cofres |
| `⌃1` / `⌃2` / `⌃3` | Quadro / Histórico Git / Notas |
| `⌘[` / `⌘]` | Voltar / Avançar |
| `⌘B` | Mostrar ou ocultar a barra lateral |
| `⌘,` | Preferências |
| `⌘/` | Todos os atalhos |

</details>

## Licença

Este projeto é disponibilizado sob a PolyForm Noncommercial License 1.0.0.

Você pode usar, estudar, modificar e redistribuir este software para as finalidades permitidas pela licença, incluindo usos pessoais, educacionais e não comerciais.

O uso comercial não é permitido sem uma licença adicional, exceto nos casos expressamente permitidos pelos termos da PolyForm. Para solicitar uma licença comercial, entre em contato com o mantenedor do projeto.

Consulte [LICENSE](LICENSE) para ver os termos completos. Em caso de divergência entre este resumo e a licença, prevalece o texto da licença.
