'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';

/**
 * DraggableTableWrapper
 * 提供桌面端鼠标按住直接横向拖拽滚动（Grab-to-Scroll / Pan）的高级交互包装器。
 * 
 * 特性：
 * 1. 鼠标悬停可滚动表格时展示抓手光标 (grab)，按住拖拽时展示紧握光标 (grabbing)；
 * 2. 自动检测表格是否溢出 (isScrollable)，未溢出时不干扰默认光标；
 * 3. 智能防误触：点击按钮、表单输入框或链接时不触发拖拽；
 * 4. 真实位移阈值检测（> 4px 判定为拖动），防止轻击操作被拦截；
 * 5. requestAnimationFrame 丝滑同步刷新，支持原生移动端 Touch 触控滑动手势；
 * 6. 拖动过程中自动消除文字意外高亮选中，松手后恢复。
 */
export default function DraggableTableWrapper({
  children,
  className = '',
  style = {},
  dragSpeed = 1.0
}) {
  const containerRef = useRef(null);
  const isDownRef = useRef(false);
  const startXRef = useRef(0);
  const scrollLeftRef = useRef(0);
  const hasDraggedRef = useRef(false);
  const rafIdRef = useRef(null);

  const [isScrollable, setIsScrollable] = useState(false);
  const [isGrabbing, setIsGrabbing] = useState(false);

  // 检查内容是否产生横向溢出
  const checkScrollable = useCallback(() => {
    const el = containerRef.current;
    if (el) {
      const scrollable = el.scrollWidth > el.clientWidth + 2;
      setIsScrollable(scrollable);
    }
  }, []);

  useEffect(() => {
    checkScrollable();
    const el = containerRef.current;
    if (!el) return;

    let resizeObserver;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        checkScrollable();
      });
      resizeObserver.observe(el);
    }

    const handleWindowResize = () => checkScrollable();
    window.addEventListener('resize', handleWindowResize);

    return () => {
      if (resizeObserver) resizeObserver.disconnect();
      window.removeEventListener('resize', handleWindowResize);
    };
  }, [checkScrollable]);

  const handleMouseDown = (e) => {
    // 仅响应鼠标左键 (Primary click)
    if (e.button !== 0) return;

    // 交互型元素（按钮、输入框、下拉框、链接、标记为 no-drag 的区域）不启动拖拽
    const target = e.target;
    if (
      target.closest &&
      target.closest('button, input, select, textarea, a, [role="button"], label, .no-drag')
    ) {
      return;
    }

    const container = containerRef.current;
    if (!container) return;

    // 仅在实际存在溢出滚动时启动
    if (container.scrollWidth <= container.clientWidth + 2) return;

    isDownRef.current = true;
    hasDraggedRef.current = false;
    startXRef.current = e.clientX;
    scrollLeftRef.current = container.scrollLeft;
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDownRef.current) return;
      const container = containerRef.current;
      if (!container) return;

      const deltaX = (e.clientX - startXRef.current) * dragSpeed;

      // 超过 4px 位移判定为真实平移拖动
      if (Math.abs(deltaX) > 4) {
        if (!hasDraggedRef.current) {
          hasDraggedRef.current = true;
          setIsGrabbing(true);
        }

        // 拖动过程中清除选中文本，避免划词遮挡
        if (window.getSelection) {
          const sel = window.getSelection();
          if (sel && sel.removeAllRanges) {
            sel.removeAllRanges();
          }
        }

        if (rafIdRef.current) {
          cancelAnimationFrame(rafIdRef.current);
        }

        rafIdRef.current = requestAnimationFrame(() => {
          if (containerRef.current) {
            containerRef.current.scrollLeft = scrollLeftRef.current - deltaX;
          }
        });
      }
    };

    const handleMouseUp = () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }
      if (isDownRef.current) {
        isDownRef.current = false;
        setIsGrabbing(false);
        if (hasDraggedRef.current) {
          // 延迟清除拖动标记，确保拦截拖拽释放瞬间的 click 事件
          setTimeout(() => {
            hasDraggedRef.current = false;
          }, 60);
        }
      }
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragSpeed]);

  // 捕获阶段拦截：若刚刚执行过拖拽移动，则阻止子元素的 click 触发
  const handleClickCapture = (e) => {
    if (hasDraggedRef.current) {
      e.stopPropagation();
      e.preventDefault();
      setTimeout(() => {
        hasDraggedRef.current = false;
      }, 0);
    }
  };

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseEnter={checkScrollable}
      onClickCapture={handleClickCapture}
      onDragStart={(e) => {
        if (isDownRef.current) {
          e.preventDefault();
        }
      }}
      className={`draggable-table-wrapper ${isScrollable ? 'is-scrollable' : ''} ${isGrabbing ? 'is-grabbing' : ''} ${className}`.trim()}
      style={{
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
        cursor: isScrollable ? (isGrabbing ? 'grabbing' : 'grab') : 'default',
        userSelect: isGrabbing ? 'none' : 'auto',
        ...style
      }}
    >
      {children}
    </div>
  );
}
