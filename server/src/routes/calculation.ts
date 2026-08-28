import { Router } from 'express';
import { assembleCalculation, serialiseResult } from '../assemble.ts';

export const calculationRouter: Router = Router({ mergeParams: true });

calculationRouter.get('/', async (req, res) => {
  const contractId = Number((req.params as { id: string }).id);
  if (!Number.isInteger(contractId) || contractId <= 0) {
    res.status(400).json({ error: 'Invalid contract id' }); return;
  }
  const result = await assembleCalculation(contractId);
  if (!result) { res.status(404).json({ error: 'No such contract' }); return; }
  res.json(serialiseResult(result));
});
