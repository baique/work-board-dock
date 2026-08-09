// 通用 IPC 结果信封（挂件只用 IpcResult，其余终端/Acp 类型已随主应用移除）。

export type IpcResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string };
