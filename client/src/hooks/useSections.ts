import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import type { Section } from '../types';

export function useSections() {
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await api.sections.list();
      setSections(data);
    } catch {
      // Non-fatal — app works without sections
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const createSection = async (name: string, color: string) => {
    const section = await api.sections.create({ name, color });
    setSections(prev => [...prev, section]);
    return section;
  };

  const updateSection = async (id: number, data: Partial<Pick<Section, 'name' | 'color'>>) => {
    const updated = await api.sections.update(id, data);
    setSections(prev => prev.map(s => s.id === id ? updated : s));
    return updated;
  };

  const deleteSection = async (id: number) => {
    await api.sections.delete(id);
    setSections(prev => prev.filter(s => s.id !== id));
  };

  return { sections, loading, createSection, updateSection, deleteSection, reload: load };
}
