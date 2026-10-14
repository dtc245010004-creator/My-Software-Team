export function getChargerWalletError(error) {
  const data = error?.response?.data;
  if (data?.error_code !== 'WALLET_INSUFFICIENT_BALANCE') return null;

  return {
    message: data.detail || 'Số dư ví chưa đủ để bắt đầu sạc. Vui lòng nạp tiền rồi thử lại.',
  };
}
