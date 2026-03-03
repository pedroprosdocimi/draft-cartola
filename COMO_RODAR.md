# Como Rodar o Draft Cartola FC

## 1. Instalar dependências do servidor

Abra um terminal (cmd ou PowerShell) na pasta do projeto:

```
cd "C:\Users\pA\Desktop\projeto draft cartola\server"
npm install
```

## 2. Instalar dependências do cliente

```
cd "C:\Users\pA\Desktop\projeto draft cartola\client"
npm install
```

## 3. Rodar em dois terminais

**Terminal 1 (servidor):**
```
cd "C:\Users\pA\Desktop\projeto draft cartola\server"
npm run dev
```
→ Roda em http://localhost:3001

**Terminal 2 (cliente):**
```
cd "C:\Users\pA\Desktop\projeto draft cartola\client"
npm run dev
```
→ Roda em http://localhost:5173

## 4. Testar

1. Abra 3 abas do browser em `http://localhost:5173`
2. Aba 1: Criar sala → copie o código de 6 letras
3. Abas 2 e 3: "Entrar com Código" → cole o código
4. Todos escolhem formação no Lobby
5. O admin (quem criou) clica "Iniciar Draft"
6. Draft começa! Cada jogador tem 60s para escolher

## Observações

- Os jogadores são buscados em tempo real da API do Cartola FC
- Se a API estiver fora do ar (fora do período do Brasileirão), os picks não funcionarão
- O banco SQLite é criado automaticamente em `server/data/draft.db`
