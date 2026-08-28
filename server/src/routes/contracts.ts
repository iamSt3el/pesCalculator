import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth/middleware.ts';
import {
  createContract, deleteContract, getContract, listContracts,
  replaceAdjustments, replaceComponents, replaceProgress, updateContract,
} from '../repo/contracts.ts';

const monthString = z.string().regex(/^\d{4}-\d{2}$/, 'Month must be YYYY-MM');
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal(''));

const contractPatch = z.object({
  agreementNo: z.string().max(200), contractor: z.string().max(300),
  workName: z.string().max(1000), woNoDate: z.string().max(300),
  woAmount: z.number(), workDoneAmount: z.number(),
  bidDate: dateString, commencement: dateString,
  stipulatedCompletion: dateString, actualCompletion: dateString,
  bitumenOffsetDays: z.number().int().min(0).max(365),
  alreadyPaid: z.number(),
}).partial();

const componentsBody = z.array(z.object({
  key: z.enum(['labour', 'material', 'cement', 'steel', 'pol', 'bitumen']),
  percent: z.number().min(0).max(100),
  factor: z.number().min(0).max(2),
  baseRule: z.enum(['quarter_average', 'bid_month', 'offset_month']),
  baseOverride: z.number().nullable(),
})).length(6);

const progressBody = z.array(z.object({
  month: monthString,
  spanDays: z.tuple([z.number().int().min(0), z.number().int().min(0),
                     z.number().int().min(0), z.number().int().min(0)]),
}));

const adjustmentsBody = z.array(z.object({ month: monthString, adjustment: z.number() }));

export const contractsRouter: Router = Router();
contractsRouter.use(requireAuth);

const parseId = (raw: string | undefined): number | null => {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
};

contractsRouter.get('/', async (_req, res) => { res.json(await listContracts()); });

contractsRouter.post('/', async (req, res) => {
  const parsed = z.object({ agreementNo: z.string().min(1).max(200) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'An agreement number is required' }); return; }
  res.status(201).json(await createContract(parsed.data.agreementNo));
});

contractsRouter.get('/:id', async (req, res) => {
  const contractId = parseId(req.params.id);
  if (contractId === null) { res.status(400).json({ error: 'Invalid contract id' }); return; }
  const bundle = await getContract(contractId);
  if (!bundle) { res.status(404).json({ error: 'No such contract' }); return; }
  res.json(bundle);
});

contractsRouter.put('/:id', async (req, res) => {
  const contractId = parseId(req.params.id);
  if (contractId === null) { res.status(400).json({ error: 'Invalid contract id' }); return; }
  const parsed = contractPatch.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues }); return; }
  await updateContract(contractId, parsed.data);
  res.json(await getContract(contractId));
});

contractsRouter.delete('/:id', async (req, res) => {
  const contractId = parseId(req.params.id);
  if (contractId === null) { res.status(400).json({ error: 'Invalid contract id' }); return; }
  await deleteContract(contractId);
  res.status(204).end();
});

function replaceRoute<T>(
  path: string,
  schema: z.ZodType<T>,
  apply: (contractId: number, value: T) => Promise<void>,
): void {
  contractsRouter.put(`/:id/${path}`, async (req, res) => {
    const contractId = parseId(req.params.id);
    if (contractId === null) { res.status(400).json({ error: 'Invalid contract id' }); return; }
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.issues }); return; }
    await apply(contractId, parsed.data);
    res.json(await getContract(contractId));
  });
}

replaceRoute('components', componentsBody, replaceComponents);
replaceRoute('progress', progressBody, replaceProgress);
replaceRoute('payments', adjustmentsBody, replaceAdjustments);
