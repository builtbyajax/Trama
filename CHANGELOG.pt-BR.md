<p align="center">
  <a href="CHANGELOG.md">English</a> &nbsp;·&nbsp; <strong>Português brasileiro</strong>
</p>

# Changelog

Mudanças entregues em cada versão do Trama. A seção **Em desenvolvimento** reúne alterações implementadas que ainda não foram lançadas; ao publicar uma versão, substitua esse título pelo número e pela data da release.

## [Em desenvolvimento]

### Adicionado

- Busca por atualizações assinadas automaticamente ou manualmente nas Preferências; a busca manual continua disponível mesmo após encontrar uma atualização.
- Instalação da atualização disponível e reinício do app pelo aviso ou pelas Preferências, mantendo um indicador nas Preferências após dispensar o aviso.
- A atualização encontrada continua disponível após dispensar o aviso; falhas no download permitem nova tentativa e operações simultâneas são evitadas.
- No macOS, a atualização reabre o app pelo ícone existente no Dock; no Windows, a instalação é bloqueada enquanto o `trama-agent.exe` estiver em uso.
- Após uma troca de versão, recomendar reiniciar as sessões dos agentes para reconectar ao MCP incluído na versão instalada, inclusive após um downgrade.

### Alterado

- Arquivos e pastas agora são ordenados juntos por nome no explorador de notas, com ordem numérica natural.

### Corrigido

- Chamadas MCP de agentes conectados a um banco migrado por um app mais novo são recusadas.

## [0.2.1](https://github.com/builtbyajax/Trama/releases/tag/v0.2.1) — 2026-10-24

### Corrigido

- Sessões de desenvolvimento usam dados separados por padrão, evitando migrações involuntárias dos bancos pessoais.
- Requisições de hosts e origens não confiáveis são recusadas na ponte local de desenvolvimento.
- Recusa de bancos de uma versão mais nova sem alterar o arquivo principal ou os dados pendentes no WAL.
- Abertura simultânea de um espaço durante uma migração, evitando falhas por bloqueio na ativação do WAL.
- Proteção das notas contra atalhos simbólicos que apontam para pastas ocultas.
- Ação de descartar e recarregar uma nota em conflito permanece disponível ao sair do editor.
- Links de notas com escapes inválidos deixam de interromper a renderização.
- MCP passa a informar a versão real do schema e recusa valores nulos em campos obrigatórios de uma atualização de tarefa.

## [0.2.0](https://github.com/builtbyajax/Trama/releases/tag/v0.2.0) — 2026-10-24

### Adicionado

- Espaços de trabalho locais, cada um com seu próprio banco de dados.
- Criação, edição, troca, remoção e exclusão de espaços de trabalho.
- Transferência de projetos entre espaços, preservando tarefas e dados relacionados.
- Objetivos por projeto, com tarefas associadas e acompanhamento do progresso.
- Criação, consulta e edição de objetivos pelo MCP.

### Alterado

- Banco atualizado para o schema 10, preservando os dados existentes. Após a migração, o Trama 0.1.0 não abre esse banco.

## [0.1.0](https://github.com/builtbyajax/Trama/releases/tag/v0.1.0) — 2026-10-23

### Adicionado

- Aplicativo desktop para macOS e Windows, com armazenamento SQLite local.
- Quadro de tarefas com responsáveis, categorias, rascunhos, atalhos e arquivamento.
- Consulta de histórico Git, branches, diferenças de arquivos e pull requests.
- Edição de notas Markdown com busca, prévia e anexos em tarefas.
- Servidor MCP local e skill para conectar agentes de código ao quadro.
- Anotações pessoais das tarefas privadas para os agentes.
- Interface em inglês e português brasileiro.
