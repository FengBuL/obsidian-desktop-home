import { createElement, Home, Search, BookOpen, FileText, Star, CalendarDays, Settings, Image, LayoutGrid, Plus, X, Check, ArrowUpRight, ArrowLeft, ArrowRight, Pin, Clock, Sun, Cloud, CloudSun, CloudRain, CloudSnow, CloudLightning, MapPin, RefreshCw, Upload, Grip, ChevronRight, Moon, Palette, CircleHelp, Undo2 } from 'lucide';
const icons = { home: Home, search: Search, book: BookOpen, note: FileText, star: Star, calendar: CalendarDays, settings: Settings, image: Image, grid: LayoutGrid, plus: Plus, close: X, check: Check, arrow: ArrowUpRight, left: ArrowLeft, right: ArrowRight, pin: Pin, clock: Clock, sun: Sun, cloud: Cloud, partly: CloudSun, rain: CloudRain, snow: CloudSnow, thunder: CloudLightning, location: MapPin, refresh: RefreshCw, upload: Upload, grip: Grip, chevron: ChevronRight, moon: Moon, palette: Palette, help: CircleHelp };
const extended = { ...icons, undo: Undo2 };
export type IconName = keyof typeof extended;
export function icon(doc: Document, name: IconName, size = 20): SVGElement {
  const node = createElement(extended[name]);
  for (const [key, value] of Object.entries({ width: size, height: size, 'stroke-width': 1.7, 'aria-hidden': 'true' })) node.setAttribute(key, String(value));
  return doc.adoptNode(node) as SVGElement;
}
export function weatherIcon(code: number): IconName { return code === 0 ? 'sun' : code < 3 ? 'partly' : code < 50 ? 'cloud' : code < 70 ? 'rain' : code < 80 ? 'snow' : code < 90 ? 'rain' : 'thunder'; }
