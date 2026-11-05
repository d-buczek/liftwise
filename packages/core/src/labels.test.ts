import { describe, expect, it } from 'vite-plus/test';
import { newId } from './ids';
import { compareLabels, copiedLabelId, dayLabelId, labelNameTaken, nextLabelColor } from './labels';
import { LABEL_COLORS, workoutLabelSchema, type WorkoutLabel } from './schemas/label';

function label(name: string, fields: Partial<WorkoutLabel> = {}): WorkoutLabel {
  return { id: newId(), name, color: 'cobalt', archived: false, ...fields };
}

describe('workoutLabelSchema', () => {
  it('trims the name and keeps it short', () => {
    expect(workoutLabelSchema.parse(label(' Push ')).name).toBe('Push');
    expect(workoutLabelSchema.safeParse(label('Klatka')).success).toBe(true);
    expect(workoutLabelSchema.safeParse(label('Plecy 2')).success).toBe(false);
    expect(workoutLabelSchema.safeParse(label('  ')).success).toBe(false);
    expect(workoutLabelSchema.safeParse(label('A', { color: 'amber' as never })).success).toBe(
      false,
    );
  });
});

describe('dayLabelId', () => {
  it("takes the oldest workout's label, skipping workouts without one", () => {
    const [a, b] = [newId(), newId()];
    const [first, second, third] = [newId(), newId(), newId()];
    expect(
      dayLabelId([
        { id: third, label_id: b },
        { id: first, label_id: null },
        { id: second, label_id: a },
      ]),
    ).toBe(a);
    expect(dayLabelId([{ id: first, label_id: null }])).toBeNull();
    expect(dayLabelId([])).toBeNull();
  });
});

describe('nextLabelColor', () => {
  it('picks the first color no active label uses, the accent cobalt last', () => {
    expect(nextLabelColor([])).toBe('teal');
    expect(nextLabelColor([label('A', { color: 'teal' }), label('B')])).toBe('violet');
    expect(nextLabelColor([label('A', { color: 'teal', archived: true })])).toBe('teal');
    expect(nextLabelColor(LABEL_COLORS.slice(0, -1).map((color) => label('X', { color })))).toBe(
      'straw',
    );
  });

  it('starts over when every color is used', () => {
    expect(nextLabelColor(LABEL_COLORS.map((color) => label('X', { color })))).toBe('teal');
  });
});

describe('copiedLabelId', () => {
  const [a, b, archived] = [label('A'), label('B'), label('C', { archived: true })];
  const labels = [a, b, archived];
  const day = (labelId: string | null) => [{ id: newId(), label_id: labelId }];

  it("gives the source day's label to a target day without one", () => {
    expect(copiedLabelId(day(a.id), day(null), labels)).toBe(a.id);
    expect(copiedLabelId(day(a.id), [], labels)).toBe(a.id);
    expect(copiedLabelId(day(null), day(null), labels)).toBeNull();
  });

  it('keeps the target day its own label', () => {
    expect(copiedLabelId(day(a.id), day(b.id), labels)).toBeNull();
  });

  it('skips an archived source label; a deleted label counts as none', () => {
    expect(copiedLabelId(day(archived.id), day(null), labels)).toBeNull();
    expect(copiedLabelId(day(newId()), day(null), labels)).toBeNull();
    expect(copiedLabelId(day(a.id), day(newId()), labels)).toBe(a.id);
  });
});

describe('labelNameTaken', () => {
  const push = label('Push');
  const labels = [push, label('Nogi', { archived: true })];

  it('compares active names regardless of case and spaces', () => {
    expect(labelNameTaken(labels, ' push ')).toBe(true);
    expect(labelNameTaken(labels, 'Pull')).toBe(false);
  });

  it('ignores archived labels and the label being edited', () => {
    expect(labelNameTaken(labels, 'nogi')).toBe(false);
    expect(labelNameTaken(labels, 'Push', push.id)).toBe(false);
  });
});

describe('compareLabels', () => {
  it('sorts active labels by name, then archived ones', () => {
    const names = [label('B'), label('A', { archived: true }), label('10'), label('2'), label('A')]
      .sort(compareLabels)
      .map((l) => `${l.name}${l.archived ? '*' : ''}`);
    expect(names).toEqual(['2', '10', 'A', 'B', 'A*']);
  });
});
