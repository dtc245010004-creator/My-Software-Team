import { describe, expect, it } from 'vitest';
import { normalizeTelemetry } from './telemetryClient';

describe('normalizeTelemetry', () => {
  it('maps backend fields to the fields consumed by ActiveSession', () => {
    expect(
      normalizeTelemetry({
        event: 'TELEMETRY',
        session_id: 42,
        energy_kwh: 1.25,
        cost_estimate: 4823,
        soc: 37,
        temp_c: 32.5,
      }),
    ).toMatchObject({
      current_energy_kwh: 1.25,
      cost_estimate_vnd: 4823,
      soc_percent: 37,
      temperature_c: 32.5,
    });
  });

  it('preserves already normalized fields as a fallback', () => {
    expect(
      normalizeTelemetry({
        current_energy_kwh: 2,
        cost_estimate_vnd: 3000,
        soc_percent: 50,
        temperature_c: 35,
      }),
    ).toMatchObject({
      current_energy_kwh: 2,
      cost_estimate_vnd: 3000,
      soc_percent: 50,
      temperature_c: 35,
    });
  });
});
