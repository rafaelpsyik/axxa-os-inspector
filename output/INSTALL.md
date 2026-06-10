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

### Como inspecionar no toque (touch) — menu flutuante

No mobile o painel ocupa a tela inteira, então use o **menu flutuante** que
fica por cima do app real:

1. Toque no ícone de faixa **"AXXA: floating inspector controls"** (ícone de
   mover) — ou rode o comando *"Toggle floating controls (Freeze + arrows)"*.
2. Ative o **Freeze** 🔒. A tela ganha uma **borda vermelha** indicando que está
   congelada: a partir daí, **os toques não acionam comandos do Obsidian** — eles
   apenas **selecionam** o elemento sob o dedo no inspetor.
3. **Toque** no elemento que quer analisar — o nome/seletor e o tamanho
   aparecem no próprio menu flutuante (feedback imediato, sem abrir o painel).
4. Use as **setas** para navegar no DOM sem precisar de precisão no toque:
   - ⬆️ elemento **pai**
   - ⬇️ primeiro **filho**
   - ⬅️ irmão **anterior** · ➡️ próximo **irmão**
5. Toque em **Panel** para abrir os detalhes completos (estilos, regras,
   variáveis, etc.), ou desative o **Freeze** para voltar a usar o Obsidian.

> O menu flutuante é **arrastável** (segure a barra "AXXA Inspector" e mova)
> para não cobrir o que você está inspecionando.
> Dica: ative *Graceful degradation* nas configurações para alvos de toque
> maiores (≥ 36 px).

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
