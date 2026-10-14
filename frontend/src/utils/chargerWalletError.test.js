import { describe, expect, it } from 'vitest';
import { getChargerWalletError } from './chargerWalletError';

describe('getChargerWalletError', () => {
  it('recognizes the backend wallet error and preserves its explanation', () => {
    expect(
      getChargerWalletError({
        response: {
          data: {
            error_code: 'WALLET_INSUFFICIENT_BALANCE',
            detail: 'Số dư hiện tại thấp hơn hạn mức tối thiểu.',
          },
        },
      }),
    ).toEqual({ message: 'Số dư hiện tại thấp hơn hạn mức tối thiểu.' });
  });

  it('returns null for unrelated request failures', () => {
    expect(getChargerWalletError({ response: { data: { error_code: 'BUSY' } } })).toBeNull();
  });
});
