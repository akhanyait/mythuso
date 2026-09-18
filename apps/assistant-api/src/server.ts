import express from 'express';
import { handleTurn } from './routes/turn';

const app = express();
app.use(express.json());

app.post('/assistant/turn', async (req, res) => {
  const result = await handleTurn(req.body);
  res.json(result);
});

app.get('/assistant/health', (_req, res) => {
  res.json({ ok: true, mode: 'phase-2-safe' });
});

app.listen(3001, () => {
  console.log('Assistant API listening on 3001');
});
