# 小施工單：配課表頁首加「老師管理」按鈕

出單：Harness 9 ｜ 對象：Codex Engineer 9 ｜ 2026-06-26

## 背景
老師管理目前只能從「新增課程」彈窗裡的「管理老師」按鈕進入，藏得太深。
要在配課表頁首加一顆獨立按鈕，直接打開老師管理 modal。

**好消息：state 與 modal 都已存在，這純粹是加一顆按鈕接既有 handler。**
- `teacherManagerOpen` / `setTeacherManagerOpen` 已宣告（`app/(app)/workspace/page.tsx:56`）
- `<TeacherManagerModal>` 已 render（同檔 ~235 行）
- 你只要讓新按鈕 `onClick={() => setTeacherManagerOpen(true)}`

## 動工範圍
**只碰** `app/(app)/workspace/page.tsx`。不要碰其他檔、不要動 API/DB。

## 要做的事
在頁首右側控制區（`<div className="flex items-center gap-3">`，約 156 行）裡，於「view toggles」群組與「Date nav」之間（即現有 `<div className="h-5 w-px bg-border" />` 分隔線附近），加入一顆「老師管理」按鈕。

建議樣式比照現有 `今天` 按鈕（line 190-195）的視覺，配一個 lucide 圖示（`Users` 或 `UserCog`，記得加到檔案頂部 lucide-react 的 import）：

```tsx
<button
  onClick={() => setTeacherManagerOpen(true)}
  className="flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
>
  <Users size={14} />
  老師管理
</button>
```

放置位置自行抓最順眼的：可放在 view toggles 與 date nav 兩個分隔線之間自成一組，或併進右側群組。重點是**頁首一眼看得到、點了會開老師管理 modal**。

## 注意
- 不要重複 render `TeacherManagerModal`（已經有了），只加觸發按鈕。
- 彈窗裡原本那顆「管理老師」按鈕**保留不動**（兩個入口並存沒問題）。
- 老師管理 modal 關閉後既有的 `closeTeacherManager` 會 bump `teachersVersion`，下拉刷新邏輯不用改。

## 完工要求
- `npx tsc --noEmit` → 0 error；`npm run lint` → 不得新增 warning。
- 能在 dev server 看到頁首按鈕、點擊開啟老師管理 modal 即可。
- 不要 commit/push（等老闆指示）。
- 回報：截圖或描述按鈕位置、tsc/lint 結果。
