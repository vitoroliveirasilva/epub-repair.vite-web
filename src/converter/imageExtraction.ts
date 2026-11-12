export interface PdfImageRegion { x: number; y: number; width: number; height: number }
type Matrix = [number, number, number, number, number, number];

function asMatrix(raw: unknown): Matrix | undefined {
  return Array.isArray(raw) && raw.length === 6 &&
    raw.every((n) => typeof n === 'number' && Number.isFinite(n)) ? raw as Matrix : undefined;
}
function multiply(a: Matrix, b: Matrix): Matrix {
  return [a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1],
    a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3],
    a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5]];
}
function bound(matrix: Matrix, width: number, height: number): PdfImageRegion | undefined {
  const points: Array<[number, number]> = [[0,0],[0,1],[1,0],[1,1]];
  const xx = points.map(([x,y]) => matrix[0]*x+matrix[2]*y+matrix[4]);
  const yy = points.map(([x,y]) => matrix[1]*x+matrix[3]*y+matrix[5]);
  const x = Math.max(0, Math.min(...xx));
  const y = Math.max(0, Math.min(...yy));
  const w = Math.min(width, Math.max(...xx))-x;
  const h = Math.min(height, Math.max(...yy))-y;
  const regularImage = w >= Math.max(28,width*0.08) && h >= Math.max(20,height*0.025) &&
    w*h >= width*height*0.008;
  const compactDiagram = w >= Math.max(70,width*0.11) && h >= Math.max(18,height*0.022) &&
    w*h >= width*height*0.003;
  if (!regularImage && !compactDiagram) return undefined;
  return { x, y, width:w, height:h };
}
function overlap(a: PdfImageRegion, b: PdfImageRegion): number {
  const w=Math.max(0,Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x));
  const h=Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y));
  return w*h/Math.max(1,Math.min(a.width*a.height,b.width*b.height));
}

export function locateEmbeddedImageRegions(
  fnArray: number[], argsArray: unknown[][], ops: Record<string,number>,
  viewport: { width:number; height:number; transform:number[] },
): PdfImageRegion[] {
  const base = asMatrix(viewport.transform);
  if (!base) return [];
  const paintOps = new Set([ops.paintImageXObject,ops.paintInlineImageXObject,
    ops.paintImageMaskXObject,ops.paintJpegXObject]
    .filter((value): value is number => typeof value === 'number'));
  let current: Matrix = [1,0,0,1,0,0];
  const stack: Matrix[] = [];
  const images: PdfImageRegion[] = [];
  for (let i=0; i<fnArray.length; i+=1) {
    const opcode=fnArray[i]; const args=argsArray[i]??[];
    if (opcode===ops.save) stack.push([...current]);
    else if (opcode===ops.restore) current=stack.pop()??[1,0,0,1,0,0];
    else if (opcode===ops.transform) {
      const transform=asMatrix(args);
      if (transform) current=multiply(current,transform);
    } else if (opcode===ops.paintFormXObjectBegin) {
      stack.push([...current]);
      const transform=asMatrix(args[0]);
      if (transform) current=multiply(current,transform);
    } else if (opcode===ops.paintFormXObjectEnd) {
      current=stack.pop()??[1,0,0,1,0,0];
    } else if (opcode!==undefined && paintOps.has(opcode)) {
      const region=bound(multiply(base,current),viewport.width,viewport.height);
      if (region && !images.some((other)=>overlap(other,region)>0.93)) images.push(region);
    }
  }
  return images.sort((a,b)=>a.y-b.y || a.x-b.x);
}
