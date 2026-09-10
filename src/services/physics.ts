/**
 * ============================================================================
 * ФИЗИЧЕСКИЙ ДВИЖОК И КИНЕМАТИКА ДВИЖЕНИЯ ПО ПЕРРОНУ
 * ----------------------------------------------------------------------------
 * Предоставляет математические функции для плавной интерполяции координат
 * объектов и агрегации специалистов в совместный спецавтотранспорт.
 * 
 * Особенности:
 * - LERP (Linear Interpolation) для непрерывной анимации движения с частотой 60 fps
 * - Группировка инженеров одной бригады в один автомобиль ПТО (Apron Vehicle)
 *   при выезде с одной базы на одну стоянку, что предотвращает визуальное
 *   наложение и отражает реальную логику выезда бригады на одном автомобиле.
 * ============================================================================
 */

import { Worker } from '../types/index';

/**
 * Функция линейной интерполяции (Linear Interpolation) между двумя значениями.
 *
 * @param start Начальное значение координаты
 * @param end Конечное значение координаты
 * @param amt Доля прогресса интерполяции от 0.0 до 1.0
 * @returns Промежуточное значение координаты
 */
export function lerp(start: number, end: number, amt: number): number {
  return (1 - amt) * start + amt * end;
}

/**
 * Группирует специалистов, перемещающихся на спецавтомобиле с одной базы на один вызов.
 * 
 * Если на одну задачу назначено несколько техников (например, 2xB1 + 1xCat-A),
 * и они отправляются с одного пункта ПТО на спецмашине, они объединяются
 * в один визуальный экипаж спецавтомобиля на карте перрона.
 * 
 * @param workers Полный список сотрудников смены
 * @returns Объект со сгруппированными экипажами (grouped) и индивидуально перемещающимися (individuals)
 */
export function groupTransitWorkersByVehicle(workers: Worker[]): {
  grouped: Map<string, Worker[]>;
  individuals: Worker[];
} {
  const grouped = new Map<string, Worker[]>();
  const individuals: Worker[] = [];

  workers.forEach(worker => {
    if (worker.status === 'IN_TRANSIT' && worker.vehicle === 'APRON_VEHICLE' && worker.currentTaskId) {
      const key = `${worker.currentTaskId}_${worker.baseId}`;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(worker);
    } else {
      individuals.push(worker);
    }
  });

  return { grouped, individuals };
}
