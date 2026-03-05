import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/utils/cn';

interface TooltipProps {
  content?: string;
  children: React.ReactElement;
  position?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
  delay?: number;
}

const Tooltip: React.FC<TooltipProps> = ({ 
  content, 
  children, 
  position = 'top',
  className,
  delay = 200 
}) => {
  if (!content) return children;

  const [isVisible, setIsVisible] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLElement | null>(null);
  const timerRef = useRef<NodeJS.Timeout>();

  const updatePosition = () => {
     if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        let top = 0;
        let left = 0;
        const gap = 8; // Gap between element and tooltip

        // Calculate position based on the element's bounding rect
        switch (position) {
          case 'top':
            top = rect.top - gap;
            left = rect.left + rect.width / 2;
            break;
          case 'bottom':
            top = rect.bottom + gap;
            left = rect.left + rect.width / 2;
            break;
          case 'left':
            top = rect.top + rect.height / 2;
            left = rect.left - gap;
            break;
          case 'right':
            top = rect.top + rect.height / 2;
            left = rect.right + gap;
            break;
        }
        
        setCoords({ top, left });
     }
  };

  const handleMouseEnter = (e: React.MouseEvent) => {
    // Preserve existing handler
    if (children.props.onMouseEnter) {
      children.props.onMouseEnter(e);
    }
    
    // Clear any pending hide timer
    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      updatePosition();
      setIsVisible(true);
    }, delay);
  };

  const handleMouseLeave = (e: React.MouseEvent) => {
    // Preserve existing handler
    if (children.props.onMouseLeave) {
      children.props.onMouseLeave(e);
    }
    
    if (timerRef.current) clearTimeout(timerRef.current);
    setIsVisible(false);
  };

  // Cleanup timers
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // Update position on scroll/resize
  useEffect(() => {
    const handleUpdate = () => {
      if (isVisible) {
          updatePosition();
      }
    };
    
    if (isVisible) {
        window.addEventListener('scroll', handleUpdate, true);
        window.addEventListener('resize', handleUpdate);
    }
    
    return () => {
      window.removeEventListener('scroll', handleUpdate, true);
      window.removeEventListener('resize', handleUpdate);
    };
  }, [isVisible]);

  // Clone the child element to attach event listeners and ref
  const trigger = React.cloneElement(children, {
    ref: (node: HTMLElement | null) => {
      triggerRef.current = node;
      
      // Handle existing ref on children
      const { ref } = children as any;
      if (typeof ref === 'function') {
        ref(node);
      } else if (ref && 'current' in ref) {
        (ref as React.MutableRefObject<HTMLElement | null>).current = node;
      }
    },
    onMouseEnter: handleMouseEnter,
    onMouseLeave: handleMouseLeave
  });

  return (
    <>
      {trigger}
      {isVisible && createPortal(
        <div 
          className={cn(
            "fixed z-[9999] px-3 py-1.5 text-xs font-medium text-white bg-slate-900 border border-slate-700 rounded-md shadow-lg transition-opacity duration-200 pointer-events-none whitespace-nowrap",
            className
          )}
          style={{ 
            top: coords.top, 
            left: coords.left,
            transform: `translate(${position === 'left' || position === 'right' ? '0, -50%' : '-50%, 0'}) ${
                position === 'top' ? 'translateY(-100%)' : 
                position === 'left' ? 'translateX(-100%)' : ''
            }`
          }}
        >
            {content}
        </div>,
        document.body
      )}
    </>
  );
};

export default Tooltip;
