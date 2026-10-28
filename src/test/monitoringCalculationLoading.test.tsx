import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { QuestionParticipationEditor } from '@/components/admin/calculation/QuestionParticipationEditor';
import { DimensionPolicyEditor } from '@/components/admin/calculation/DimensionPolicyEditor';

const state = vi.hoisted(() => ({ questionCalls: 0, dimensionCalls: 0, loading: true }));
const layers = { questionWeights: [], dimensionWeights: [] };
vi.mock('@/hooks/useAmlCalculationPolicy', () => ({
  PARTICIPATION_OPTIONS: [], CONTRIBUTES_TO_OPTIONS: [], DIMENSION_AGGREGATION_OPTIONS: [],
  calcPolicyErrorMessage: String,
  useCalculationPolicyLayers: () => ({ data: layers }),
  useMethodologyQuestionCatalogue: () => {
    if (++state.questionCalls > 10) throw new Error('question render loop');
    return { data: undefined, isLoading: state.loading };
  },
  useMethodologyDimensionCatalogue: () => {
    if (++state.dimensionCalls > 10) throw new Error('dimension render loop');
    return { data: undefined, isLoading: state.loading };
  },
  useSetQuestionWeights: () => ({}), useSetDimensionWeights: () => ({}),
}));
afterEach(() => { cleanup(); state.questionCalls = 0; state.dimensionCalls = 0; });
describe('catalogues unavailable while layers are ready', () => {
  it.each([true, false])('does not loop when catalogue loading is %s', loading => {
    state.loading = loading;
    render(<><QuestionParticipationEditor configId="test" methodologyId="test" canEdit={false} />
      <DimensionPolicyEditor configId="test" methodologyId="test" canEdit={false} /></>);
    expect(state.questionCalls).toBe(1);
    expect(state.dimensionCalls).toBe(1);
  });
});