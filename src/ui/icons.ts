import { createElement, Home, Search, BookOpen, FileText, Star, CalendarDays, Settings, Image, LayoutGrid, Plus, X, Check, ArrowUpRight, ArrowLeft, ArrowRight, Pin, Clock, Sun, Cloud, CloudSun, CloudRain, CloudSnow, CloudLightning, CloudFog, CloudDrizzle, MapPin, RefreshCw, Upload, Grip, ChevronRight, Moon, Palette, CircleHelp, Undo2, Circle, ListTodo, StickyNote, Images, FilePlus, SunMoon } from 'lucide';
const icons = { home: Home, search: Search, book: BookOpen, note: FileText, star: Star, calendar: CalendarDays, settings: Settings, image: Image, grid: LayoutGrid, plus: Plus, close: X, check: Check, arrow: ArrowUpRight, left: ArrowLeft, right: ArrowRight, pin: Pin, clock: Clock, sun: Sun, cloud: Cloud, partly: CloudSun, rain: CloudRain, snow: CloudSnow, thunder: CloudLightning, fog: CloudFog, drizzle: CloudDrizzle, location: MapPin, refresh: RefreshCw, upload: Upload, grip: Grip, chevron: ChevronRight, moon: Moon, palette: Palette, help: CircleHelp, undo: Undo2, circle: Circle, tasks: ListTodo, memo: StickyNote, images: Images, newNote: FilePlus, auto: SunMoon };
export type IconName = keyof typeof icons;
export function icon(doc: Document, name: IconName, size = 20): SVGElement {
  const node = createElement(icons[name]);
  for (const [key, value] of Object.entries({ width: size, height: size, 'stroke-width': 1.7, 'aria-hidden': 'true' })) node.setAttribute(key, String(value));
  return doc.adoptNode(node);
}
/** WMO 天气代码 → 图标，与 weatherDescription 保持同一分档。 */
export function weatherIcon(code: number): IconName {
  if (code === 0) return 'sun'; if (code < 3) return 'partly'; if (code === 3) return 'cloud'; if (code < 50) return 'fog'; if (code < 60) return 'drizzle';
  if (code < 70) return 'rain'; if (code < 80) return 'snow'; if (code < 85) return 'rain'; if (code < 90) return 'snow'; return 'thunder';
}
