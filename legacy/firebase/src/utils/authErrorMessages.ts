export const getSignInErrorMessage = (error: unknown): string => {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code)
    : '';

  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/user-not-found':
    case 'auth/wrong-password':
      return 'Email hoặc mật khẩu không đúng.';
    case 'auth/user-disabled':
      return 'Tài khoản này hiện đang bị khóa. Vui lòng liên hệ quản trị viên.';
    case 'auth/network-request-failed':
      return 'Không thể kết nối hệ thống. Vui lòng kiểm tra mạng và thử lại.';
    case 'auth/too-many-requests':
      return 'Có quá nhiều lần đăng nhập không thành công. Vui lòng thử lại sau.';
    default:
      return 'Đăng nhập chưa thành công. Vui lòng thử lại.';
  }
};
