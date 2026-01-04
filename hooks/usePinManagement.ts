
import { useState, useCallback } from 'react';
import { Coordinate } from '../types/spatial.types';

export const usePinManagement = () => {
  const [pins, setPins] = useState<Coordinate[]>([]);

  const addPin = useCallback((coord: Coordinate) => {
    setPins(prev => {
      if (prev.length === 2) {
        // Reset if we already have a vector, start new source
        return [coord];
      }
      return [...prev, coord];
    });
  }, []);

  const resetPins = useCallback(() => setPins([]), []);

  return { pins, addPin, resetPins };
};
