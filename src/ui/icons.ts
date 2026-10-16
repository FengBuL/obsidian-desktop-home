import { createElement, Home, Search, BookOpen, FileText, Star, CalendarDays, Settings, Image, LayoutGrid, Plus, X, Check, ArrowUpRight, ArrowLeft, ArrowRight, Pin, Clock, Sun, Cloud, CloudSun, CloudRain, CloudSnow, CloudLightning, CloudFog, CloudDrizzle, MapPin, RefreshCw, Upload, Grip, ChevronRight, Moon, Palette, CircleHelp, Undo2, Circle, ListTodo, StickyNote, Images, FilePlus, SunMoon, History, Minus, Folder } from 'lucide';
const icons = { home: Home, search: Search, book: BookOpen, note: FileText, star: Star, calendar: CalendarDays, settings: Settings, image: Image, grid: LayoutGrid, plus: Plus, close: X, check: Check, arrow: ArrowUpRight, left: ArrowLeft, right: ArrowRight, pin: Pin, clock: Clock, sun: Sun, cloud: Cloud, partly: CloudSun, rain: CloudRain, snow: CloudSnow, thunder: CloudLightning, fog: CloudFog, drizzle: CloudDrizzle, location: MapPin, refresh: RefreshCw, upload: Upload, grip: Grip, chevron: ChevronRight, moon: Moon, palette: Palette, help: CircleHelp, undo: Undo2, circle: Circle, tasks: ListTodo, memo: StickyNote, images: Images, newNote: FilePlus, auto: SunMoon, history: History, minus: Minus, folder: Folder };
export type IconName = keyof typeof icons;
export function icon(doc: Document, name: IconName, size = 20): SVGElement {
  const node = createElement(icons[name]);
  for (const [key, value] of Object.entries({ width: size, height: size, 'stroke-width': 1.75, 'aria-hidden': 'true', class: 'dh-icon' })) node.setAttribute(key, String(value));
  return doc.adoptNode(node);
}
