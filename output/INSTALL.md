# Instalação do AXXA Inspector

Esta pasta contém o **bundle pronto para instalar**. O Obsidian só precisa de
três arquivos dentro de uma pasta de plugin:

```
axxa-inspector/
├── manifest.json
├── main.js
└── styles.css
```

> O plugin é compatível com **desktop e mobile** (`isDesktopOnly: false`).
> O foco principal é **inspeção no mobile** — veja a seção Mobile abaixo.

---

## 💻 Desktop (Windows / macOS / Linux)

1. Localize a pasta de plugins do seu cofre (vault):
   `<seu-cofre>/.obsidian/plugins/`
2. Copie a pasta `axxa-inspector/` (esta, com os 3 arquivos) para dentro dela.
   O caminho final deve ficar:
   `<seu-cofre>/.obsidian/plugins/axxa-inspector/main.js`
3. No Obsidian: **Configurações → Plugins da comunidade → Recarregar plugins**.
4. Ative **AXXA Inspector**.
5. Abra pelo ícone na faixa lateral (ribbon) ou pelo comando
   *"Open inspector panel"*.

## 📱 Mobile (Android / iOS) — foco principal

No celular não há acesso fácil ao sistema de arquivos do app, então use uma
destas abordagens:

### Opção A — Sincronização (recomendado)
1. Coloque a pasta `axxa-inspector/` em
   `<seu-cofre>/.obsidian/plugins/` no **desktop**.
2. Sincronize o cofre (Obsidian Sync, iCloud, Dropbox, etc.) para o celular.
3. No app mobile: **Configurações → Plugins da comunidade → ativar AXXA Inspector**.

### Opção B — Gerenciador de arquivos (Android)
1. Copie a pasta `axxa-inspector/` para
   `Android/.../seu-cofre/.obsidian/plugins/` usando um gerenciador de arquivos.
2. Abra o Obsidian → ative o plugin.

### Como inspecionar no toque (touch)
- Ative o **modo inspeção** (botão *Inspect* no topo do painel ou o comando
  *"Toggle inspect mode"*).
- **Toque** no elemento que quer analisar: o destaque aparece imediatamente
  sob o dedo (não depende de hover).
- O segundo toque/click **congela a seleção** e abre os detalhes
  (box model, estilos, regras, variáveis…).
- Toque em outro elemento para re-mirar; use **Exit / Escape** para sair.
- Ative *Graceful degradation* nas configurações para esconder recursos
  pesados de desktop e usar alvos de toque maiores (≥ 36 px).

> Dica mobile: a faixa de overlay (content/padding/margin) e o tooltip de
> tamanho + z-index funcionam igual ao desktop, ideais para depurar barra de
> status, navegação inferior, áreas seguras (safe-area) e sobreposições.

---

## Verificação

Depois de ativar, abra o painel e confirme que as abas
**Inspect · Styles · DOM · Variables · Sheets · Mutations · Sandbox · Layout**
aparecem. Se algo não carregar, confirme que os três arquivos estão na mesma
pasta `axxa-inspector/` e recarregue os plugins.

## Reconstruir a partir do código

```bash
npm install
npm run build   # gera o main.js de produção na raiz do projeto
```

Depois copie `manifest.json`, `main.js` e `styles.css` para esta pasta `output/`
(ou direto para a pasta de plugins do cofre).
