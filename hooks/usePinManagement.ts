
import { useState, useCallback } from 'react';
import { Coordinate } from '../types/spatial.types';

export const usePinManagement = () => {
  const [pins, setPins] = useState<Coordinate[]>([]);

  /**
   * Manages pin coordinates for object selection. Single-click mode replaces previous pin.
   */
  const addPin = useCallback((coord: Coordinate) => {
    setPins(prev => [coord]);
  }, []);

  const resetPins = useCallback(() => setPins([]), []);

  return { pins, addPin, resetPins };
};
