# Escala de Congelação — DASA Brasília

Sistema web para organização da escala de congelação dos patologistas da DASA Brasília.

## Funcionalidades

- **Dashboard** — Calendário do mês atual com escala e balanceamento por patologista
- **Patologistas** — Cadastro e gerenciamento (regimes: Normal, Final de Semana, Plantão Fixo), férias e desligamentos
- **Estatísticas** — Contagem acumulada de plantões com gráficos
- **Feriados** — Cadastro manual de feriados
- **Gerar Escala** — Algoritmo automático de balanceamento com edição manual antes de publicar
- **Escalas Anteriores** — Histórico de todas as escalas publicadas

## Configuração

### 1. Firebase

1. Crie um projeto em [Firebase Console](https://console.firebase.google.com/)
2. Ative **Authentication** → Email/Senha
3. Ative **Firestore Database** (modo produção ou teste)
4. Crie um usuário em Authentication → Users
5. Adicione as regras de segurança ao Firestore:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

### 2. Variáveis de Ambiente

Copie `.env.example` para `.env` e preencha com as credenciais do seu projeto Firebase:

```bash
cp .env.example .env
```

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

### 3. Instalação e Execução Local

```bash
npm install
npm run dev
```

### 4. Deploy no GitHub Pages

```bash
npm run deploy
```

> **Importante:** Configure as variáveis de ambiente como Secrets no GitHub e use um workflow de CI/CD, ou faça o build localmente com `.env` preenchido.

## Hospitais

- **HAC** — Hospital Anchieta
- **HOBRA** — Hospital de Brasília

## Regimes dos Patologistas

| Regime | Descrição |
|--------|-----------|
| Normal | Segunda a quinta + reveza finais de semana |
| Final de Semana | Apenas finais de semana do seu slot (1º ao 4º) |
| Plantão Fixo | Dias fixos em determinado hospital + reveza finais de semana |

## Lógica de Final de Semana

- Final de semana = Sexta + Sábado + Domingo
- Cada patologista tem um "slot" de 1 a 4 (1º, 2º, 3º ou 4º final de semana do mês)
- Patologistas do mesmo slot revezam entre si nos finais de semana daquele slot
