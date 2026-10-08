export const timeToMinutes = (timeStr) => {
  if (!timeStr) return 0;
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
};

export const minutesToTime = (minutes) => {
  if (minutes === 1440) return '24:00';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

export const validateTariffPeriods = (periods) => {
  const errorsByIndex = {};
  const gaps = [];
  const overlaps = [];
  let isValid = true;

  const segments = [];
  
  // Phase 1: Basic validation and splitting overnight periods
  periods.forEach((p, index) => {
    if (!p.start || !p.end) {
      errorsByIndex[index] = 'Vui lòng nhập đầy đủ giờ bắt đầu và kết thúc.';
      isValid = false;
      return;
    }
    
    if (p.price === undefined || p.price === '' || isNaN(p.price) || Number(p.price) < 0) {
      errorsByIndex[index] = 'Chưa nhập giá hoặc giá không hợp lệ.';
      isValid = false;
      return;
    }

    let startMin = timeToMinutes(p.start);
    let endMin = timeToMinutes(p.end);

    if (startMin === endMin) {
      errorsByIndex[index] = 'Giờ bắt đầu và giờ kết thúc không được trùng nhau.';
      isValid = false;
      return;
    }

    // Overnight period (e.g., 22:00 to 02:00)
    if (endMin < startMin) {
      segments.push({ index, start: startMin, end: 1440, isOvernight: true, original: p });
      segments.push({ index, start: 0, end: endMin, isOvernight: true, original: p });
    } else {
      segments.push({ index, start: startMin, end: endMin, isOvernight: false, original: p });
    }
  });

  if (segments.length === 0) {
    return { isValid: false, errorsByIndex, gaps: [{ start: 0, end: 1440 }], overlaps: [], segments: [] };
  }

  // Phase 2: Sort segments by start time
  segments.sort((a, b) => a.start - b.start);

  let currentCovered = 0;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];

    if (seg.start > currentCovered) {
      // Gap detected
      gaps.push({ start: currentCovered, end: seg.start });
      isValid = false;
    } else if (seg.start < currentCovered) {
      // Overlap detected
      const overlapStart = seg.start;
      const overlapEnd = Math.min(currentCovered, seg.end);
      overlaps.push({ start: overlapStart, end: overlapEnd });
      
      const prevSeg = segments[i-1];
      
      const overlapMsg = `Khung ${seg.original.start}–${seg.original.end} chồng lấn với khung trước đó (trùng ${minutesToTime(overlapStart)}–${minutesToTime(overlapEnd)}).`;
      
      errorsByIndex[seg.index] = errorsByIndex[seg.index] ? errorsByIndex[seg.index] + ' ' + overlapMsg : overlapMsg;
      
      if (prevSeg) {
          const prevMsg = `Khung này bị chồng lấn từ ${minutesToTime(overlapStart)}–${minutesToTime(overlapEnd)}.`;
          errorsByIndex[prevSeg.index] = errorsByIndex[prevSeg.index] ? errorsByIndex[prevSeg.index] + ' ' + prevMsg : prevMsg;
      }
      
      isValid = false;
    }

    currentCovered = Math.max(currentCovered, seg.end);
  }

  // Check for trailing gap
  if (currentCovered < 1440) {
    gaps.push({ start: currentCovered, end: 1440 });
    isValid = false;
  }

  return { isValid, errorsByIndex, gaps, overlaps, segments };
};

