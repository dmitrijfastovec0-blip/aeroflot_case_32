/**
 * Единая точка экспорта сервисного слоя (Services) проекта «AeroDispatch».
 * 
 * Включает:
 * - dijkstra: маршрутизация по дорожному графу SVO и расчет времени прибытия (ETA).
 * - airfieldGraph: динамический дорожный граф для произвольных перронов (режим CUSTOM).
 * - hungarian: венгерский алгоритм (Kuhn-Munkres) для глобального распределения задач.
 * - predictiveLoad: предиктивный анализ дефицита квалификаций инженеров ОТО.
 * - shiftSpawner: генератор реалистичных смен авиатехников и спецтехники на перроне.
 * - physics: интерполяция движения (LERP) и группировка специалистов в спецмашины.
 * - algorithmBenchmark: воспроизводимый бенчмарк 4 алгоритмов диспетчеризации.
 */

export * from './dijkstra';
export * from './airfieldGraph';
export * from './hungarian';
export * from './predictiveLoad';
export * from './shiftSpawner';
export * from './physics';
export * from './algorithmBenchmark';
