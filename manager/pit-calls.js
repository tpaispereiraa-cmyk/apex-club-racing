export function queuePit(car, {source, reason, compound, planIndex, ruleIndex}) {
  if (car.pit || (car.pitRequested && !car.manager) || car.retired || car.finishTime !== null) return false;
  const manager = car.manager;
  if (manager) {
    const current = manager.pitCall;
    if (source !== 'manual' && source !== 'safety' && manager.keepOutLap === car.lap) return false;
    if (car.pitRequested && source !== 'manual' && source !== 'safety') return false;
    if (car.pitRequested && source === 'manual' && current?.source === 'safety') {
      source = 'safety';
      reason = current.reason;
    }
    if (car.pitRequested && source === 'safety' && current?.source === 'manual') {
      compound ??= current.compound;
      planIndex ??= current.planIndex;
    }
    manager.pitCall = {source, reason, compound, planIndex, ruleIndex, calledLap: car.lap};
    manager.requestedCompound = compound ?? null;
  }
  car.pitRequested = true;
  car.pitReason = reason;
  return true;
}

export function keepOut(car) {
  const manager = car.manager;
  if (car.pit || !car.pitRequested || manager.pitCall?.source === 'safety') return false;
  const ruleIndex = manager.pitCall?.ruleIndex;
  if (ruleIndex !== undefined) manager.usedRules = manager.usedRules.filter(index => index !== ruleIndex);
  manager.keepOutLap = car.lap;
  manager.pitCall = null;
  manager.requestedCompound = null;
  car.pitRequested = false;
  car.pitReason = '';
  return true;
}

export function pendingPlan(car) {
  const manager = car.manager;
  if (!manager) return undefined;
  const index = manager.strategy.stops.findIndex((_, i) =>
    !manager.usedStops?.includes(i) && !manager.skippedStops?.includes(i));
  return index < 0 ? undefined : {...manager.strategy.stops[index], index};
}
