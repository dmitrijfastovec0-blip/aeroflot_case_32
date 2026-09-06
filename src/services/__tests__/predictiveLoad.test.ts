import { describe, expect, it } from 'vitest';
import { buildPredictiveLoadInsights } from '../predictiveLoad';
import { OtoTask, Worker } from '../../types/index';

describe('predictive load insights', () => {
  it('detects qualification deficit from queued full crews', () => {
    const task = {
      id: 'task', standId: 'stand', standLabel: '101', aircraftType: 'A320', categoryCode: 'B1', categoryLabel: 'ATA',
      requiredCrew: [{ categoryCode: 'B1' as const, count: 2 }, { categoryCode: 'A' as const, count: 1 }],
      priority: 'AOG' as const, status: 'QUEUED' as const, crew: [], arrivedCount: 0, maxEtaMinutes: 15, slaLimitMinutes: 15,
      withinSla: true, createdAt: '12:00', elapsedWorkSec: 0, targetWorkSec: 40
    } as OtoTask;
    const worker: Worker = { id: 'w', name: 'B1', category: 'ENGINES_AIRFRAME', categoryCode: 'B1', status: 'FREE_STATIONARY', baseId: 'base', x: 1, y: 1, vehicle: 'WALK' };
    const insights = buildPredictiveLoadInsights([task], [worker]);
    expect(insights.find(item => item.categoryCode === 'B1')).toMatchObject({ queuedDemand: 2, availableSupply: 1, deficit: 1, risk: 'HIGH' });
    expect(insights.find(item => item.categoryCode === 'A')).toMatchObject({ queuedDemand: 1, availableSupply: 1, deficit: 0, risk: 'LOW' });
  });
});
