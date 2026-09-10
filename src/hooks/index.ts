/**
 * Единая точка экспорта React-хуков движка симуляции и рендеринга.
 * 
 * - useSimulationEngine: центральный оркестратор состояния симуляции перрона,
 *   тактов сим-времени, очереди задач, перехода статусов специалистов и расчёта ROI.
 * - useCanvasEngine: высокопроизводительный Canvas 2D движок отрисовки перрона,
 *   зданий, стоянок, дорожной сети, спецтранспорта и траекторий движения.
 */

export { useSimulationEngine } from './useSimulationEngine';
export type { ControlTestResult } from './useSimulationEngine';
export { useCanvasEngine } from './useCanvasEngine';
