/**
 * ============================================================================
 * СЕРВИС ПРЕДИКТИВНОГО АНАЛИЗА НАГРУЗКИ И ДЕФИЦИТА КВАЛИФИКАЦИЙ
 * ----------------------------------------------------------------------------
 * Выполняет упреждающую оценку баланса спроса и предложения инженерного
 * состава на перроне до момента физического назначения задач.
 * 
 * Бизнес-цель:
 *   Позволяет руководителю смены ОТО и диспетчеру мгновенно видеть, по какой
 *   из квалификаций (B1, B2 или Cat-A) назревает операционный кризис из-за
 *   наплыва входящих дефектов, и заблаговременно запросить усиление смены
 *   или перераспределить ресурсы между секторами перрона.
 * 
 * Учет взаимозаменяемости:
 *   Инженеры категорий B1 и B2 обладают достаточными допусками для закрытия
 *   простых операций категории А (осмотры, долив жидкостей), поэтому при оценке
 *   резерва Cat-A свободные инженеры B1/B2 также учитываются как потенциальное
 *   предложение.
 * ============================================================================
 */

import { OtoTask, CategoryCode, Worker } from '../types/index';

/**
 * Аналитическая сводка по одной квалификационной категории
 */
export interface PredictiveLoadInsight {
  /** Код квалификации (B1, B2, A) */
  categoryCode: CategoryCode;
  /** Текущая потребность в специалистах в очереди заявок (чел-слоты) */
  queuedDemand: number;
  /** Доступное число свободных специалистов на перроне */
  availableSupply: number;
  /** Расчетный дефицит специалистов (max(0, demand - supply)) */
  deficit: number;
  /** Уровень операционного риска: LOW — норма, MEDIUM — умеренный, HIGH — критический дефицит */
  risk: 'LOW' | 'MEDIUM' | 'HIGH';
}

/**
 * Рассчитывает предиктивный дефицит и риски по квалификациям B1, B2 и Cat-A.
 * 
 * @param tasks Список всех текущих задач симуляции
 * @param workers Список всех сотрудников текущей смены
 * @returns Массив аналитических показателей по каждой категории
 */
export function buildPredictiveLoadInsights(tasks: OtoTask[], workers: Worker[]): PredictiveLoadInsight[] {
  const categories: CategoryCode[] = ['B1', 'B2', 'A'];
  const demand: Record<CategoryCode, number> = { B1: 0, B2: 0, A: 0 };
  const supply: Record<CategoryCode, number> = { B1: 0, B2: 0, A: 0 };

  // 1. Подсчет суммарного спроса по всем задачам, ожидающим в очереди (QUEUED)
  tasks
    .filter(task => task.status === 'QUEUED')
    .forEach(task => {
      const requirements = task.requiredCrew && task.requiredCrew.length > 0
        ? task.requiredCrew
        : [{ categoryCode: task.categoryCode, count: 1 }];
      requirements.forEach(requirement => {
        demand[requirement.categoryCode] += requirement.count;
      });
    });

  // 2. Подсчет доступного предложения среди свободных сотрудников
  workers
    .filter(worker => worker.status === 'FREE_STATIONARY' || worker.status === 'FREE_PATROLLING')
    .forEach(worker => {
      supply[worker.categoryCode] += 1;
      // Инженеры B1 и B2 квалифицированы также закрывать слоты Cat-A при необходимости
      if (worker.categoryCode !== 'A') {
        supply.A += 1;
      }
    });

  // 3. Формирование итогового отчета с оценкой операционного риска
  return categories.map(categoryCode => {
    const deficit = Math.max(0, demand[categoryCode] - supply[categoryCode]);
    const ratio = demand[categoryCode] === 0 ? 0 : deficit / demand[categoryCode];
    return {
      categoryCode,
      queuedDemand: demand[categoryCode],
      availableSupply: supply[categoryCode],
      deficit,
      risk: deficit === 0 ? 'LOW' : ratio >= 0.5 ? 'HIGH' : 'MEDIUM'
    };
  });
}
