# Instalação e conexão com agentes

[English](installation.md) · **Português brasileiro**

O Trama é um aplicativo desktop que inclui um servidor MCP local. Quando os instaladores estiverem disponíveis, usar o app não exigirá Node.js, Rust ou um ambiente de desenvolvimento.

**Os instaladores ainda não foram publicados.** Por enquanto, siga as [instruções para executar pelo código-fonte](../README.pt-BR.md#desenvolvimento). Os passos abaixo descrevem a distribuição planejada pelo GitHub Releases.

## Instale o aplicativo

### macOS

O Trama exige macOS 14 ou posterior.

Quando houver uma release disponível:

1. Baixe o `.dmg` correspondente ao processador do seu Mac na página de Releases do repositório no GitHub.
2. Abra o arquivo e arraste **Trama.app** para **Aplicativos**.
3. Abra o Trama pela pasta Aplicativos.

As builds de teste ainda não têm a notarização da Apple, então na primeira abertura o macOS avisa que não pôde verificar o app. Para abrir mesmo assim:

1. Clique em **OK** no aviso. Não mova o app para o Lixo.
2. Abra **Ajustes do Sistema** › **Privacidade e Segurança** e role até **Segurança**.
3. Ao lado da mensagem sobre o Trama, clique em **Abrir Mesmo Assim** e confirme com sua senha ou Touch ID.

Isso só é necessário uma vez. No macOS 14, também dá para clicar no Trama com a tecla Control pressionada, na pasta Aplicativos, e escolher **Abrir**.

### Windows

Quando houver uma release disponível:

1. Baixe o instalador Windows x64 `.exe` na página de Releases do repositório no GitHub.
2. Execute o instalador e siga suas instruções.
3. Abra o Trama pelo menu Iniciar.

O instalador ainda não é assinado, então o SmartScreen do Windows pode mostrar **O Windows protegeu o computador**. Clique em **Mais informações** e depois em **Executar assim mesmo**.

O app usa o Microsoft WebView2. Se o runtime estiver ausente, a instalação poderá precisar de uma conexão com a internet para baixá-lo. Consulte os [pré-requisitos do Tauri para Windows](https://v2.tauri.app/start/prerequisites/#windows).

## Conecte seu agente

O Trama inclui o `trama-agent`, um servidor que o cliente MCP inicia por STDIO. Configure-o uma vez em cada cliente de código que quiser usar. A interface gráfica do Trama pode ficar fechada enquanto o servidor está em uso.

| Sistema | Caminho do servidor instalado |
| --- | --- |
| macOS | `/Applications/Trama.app/Contents/MacOS/trama-agent` |
| Windows | `trama-agent.exe`, ao lado do executável do app na pasta de instalação escolhida |

Se estiver executando pelo código-fonte, siga primeiro as [instruções de desenvolvimento](../README.pt-BR.md#desenvolvimento). Iniciar o app em desenvolvimento também compila o servidor MCP. Nos exemplos abaixo, use o caminho absoluto de `app/src-tauri/target/debug/trama-agent`, ou `trama-agent.exe` no Windows. Definir `CARGO_TARGET_DIR` muda esse local de saída.

### Codex

Adicione o servidor a `~/.codex/config.toml` para seu usuário ou a `.codex/config.toml` dentro de um projeto confiável.

macOS:

```toml
[mcp_servers.trama]
command = "/Applications/Trama.app/Contents/MacOS/trama-agent"
args = ["--workspace"]
```

Windows, substituindo o caminho de exemplo pela sua pasta de instalação:

```toml
[mcp_servers.trama]
command = 'C:\path\to\Trama\trama-agent.exe'
args = ["--workspace"]
```

Consulte as opções na [documentação oficial de MCP do Codex](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).

### Claude Code

Execute o comando correspondente ao seu sistema. A opção `--scope user` disponibiliza o servidor nos seus projetos.

macOS:

```sh
claude mcp add --scope user --transport stdio trama -- /Applications/Trama.app/Contents/MacOS/trama-agent --workspace
```

Windows, no PowerShell, substituindo o caminho de exemplo:

```powershell
claude mcp add --scope user --transport stdio trama -- "C:\path\to\Trama\trama-agent.exe" --workspace
```

Consulte a [documentação de MCP do Claude Code](https://code.claude.com/docs/en/mcp).

### OpenCode V2

Adicione o servidor em `mcp.servers` na configuração do OpenCode. Acrescente a entrada à configuração existente em vez de substituir o arquivo.

macOS:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "servers": {
      "trama": {
        "type": "local",
        "command": [
          "/Applications/Trama.app/Contents/MacOS/trama-agent",
          "--workspace"
        ]
      }
    }
  }
}
```

Windows, substituindo o caminho de exemplo:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "servers": {
      "trama": {
        "type": "local",
        "command": ["C:\\path\\to\\Trama\\trama-agent.exe", "--workspace"]
      }
    }
  }
}
```

Esses exemplos são para a V2. Versões anteriores do OpenCode usam outra estrutura de configuração. Consulte a [documentação de MCP do OpenCode V2](https://opencode.ai/v2/docs/mcp-servers) e use `opencode mcp list` para conferir a conexão.

Reinicie ou recarregue o cliente após mudar a configuração. Peça ao agente para listar os projetos disponíveis no Trama e confirmar que consegue se conectar.

### Escolha o escopo

- `--workspace` disponibiliza os projetos do Trama. As ferramentas de um projeto ainda precisam de `project_id`; o agente pode descobri-lo com `list_projects`.
- `--project-id UUID` limita o servidor a um projeto. Copie o ID nas Preferências do Trama.

### Ensine o fluxo

Adicione a pasta [`skills/trama`](../skills/trama/SKILL.md) ao local de skills do seu cliente. Ela descreve a prioridade das tarefas, como pegar trabalho da fila, registrar referências da entrega e devolver o trabalho para revisão.

O servidor MCP não pode ler nem alterar as anotações privadas das tarefas. As notas Markdown do projeto são separadas: o servidor pode lê-las e editá-las pelas ferramentas de documentos.

## Dados locais

| Sistema | Banco de tarefas |
| --- | --- |
| macOS | `~/Library/Application Support/Trama/trama.sqlite` |
| Windows | `%APPDATA%\Trama\trama.sqlite` |

As notas dos projetos continuam nas pastas que você escolheu no app. São arquivos Markdown comuns e ficam fora do banco de tarefas.

Defina `TRAMA_DB` para usar outro caminho de SQLite no desenvolvimento. Ao mudar esse caminho, faça o app e o servidor MCP apontarem para o mesmo banco.
