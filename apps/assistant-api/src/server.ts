import express from 'express';
import { handleTurn } from './routes/turn';

const app = express();
app.use(express.json({ limit: '16kb' }));

app.post('/assistant/turn', async (req, res) => {
  try {
    const result = await handleTurn(req.body);
    res.status(200).json(result);
  } catch {
    res.status(400).json({
      error: 'invalid_request',
      message: 'The request could not be processed safely.',
    });
  }
});

app.get('/assistant/health', (_req, res) => {
  res.json({ ok: true, mode: 'phase-2-safe' });
});

app.listen(3001, () => {
  console.log('Assistant API listening on 3001');
});
