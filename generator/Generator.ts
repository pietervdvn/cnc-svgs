import * as xml2js from "xml2js"
import {writeFileSync} from "fs";

const cutStyle = {
    stroke: "#ff0000",
    "stroke-width": "1mm",
    style: "fill:none;stroke-width:1"
}

const black = {
    stroke: "#000000",
    "stroke-width": "1mm",
    style: "fill:none;stroke-width:1"
}


class Vect {

    public readonly x: number;
    public readonly y: number

    constructor(x: number, y: number) {
        this.x = x;
        this.y = y;
    }

    public add(v: Vect): Vect {
        return new Vect(this.x + v.x, this.y + v.y)
    }

    public addxy(x: number, y: number): Vect {
        return new Vect(this.x + x, this.y + y)
    }


    public sub(v: Vect): Vect {
        return new Vect(this.x - v.x, this.y - v.y)
    }

    public mul(n: number) {
        return new Vect(this.x * n, this.y * n)
    }

    public lineSegment(to: Vect) {
        return " M" + this.x + " " + this.y + " L" + to.x + " " + to.y
    }

    public dist(to: Vect): number {
        return Math.sqrt(
            Math.pow(this.x - to.x, 2) +
            Math.pow(this.y - to.y, 2)
        )
    }

    public translate(): Vect {
        return new Vect(this.y, this.x)
    }

    public rotate(degrees: number): Vect {
        const cos = Math.cos(degrees * Math.PI / 180);
        const sin = Math.sin(degrees * Math.PI / 180);
        const x = (cos * this.x) + (sin * this.y)
        const y = (cos * this.y) - (sin * this.x)
        return new Vect(x, y)
    }
}

function circle(cx: number, cy: number, radius: number): any {
    return {
        circle:
            {
                $: {
                    cx, cy, r: radius,
                    ...cutStyle
                }
            }
    }
}

/**
 * For a regularoid with `n` sides, calculates the radius in order for the sides to be 'length' long
 * @param n
 * @param length
 */
function radiusForRegularoid(n:number, length : number){
    /*
    
    x
    |  .
    |      .
    |           .
    |               .
    -------------------y
    
    With: 'y' = centerpoitn
    'x'= a corner
    this implies that '|' is length/2 and '.' is our needed radius
    y has a corner of (360° / n / 2)
    so: sin(y) = '|' / '.' 
    Thus: sin(y) = (length/2) / radius
    Thus: sin(180° / n) * 2 / length = 1/radius
    Thus: radius = length / sin(180° / n) * 2
    
     */
    return length / (Math.sin(Math.PI / n) * 2 )
}

function regularoid(center: Vect, n: number, radius: number): Vect[] {

    if(radius < 1){
        throw "This is a very small radius: "+radius
    }
    const points = []

    const up = new Vect(0, -radius)
    const degrees = 360 / n;
    for (let i = 0; i < n + 1; i++) {
        points.push(
            center.add(up.rotate(-i * degrees))
        )
    }

    return points;
}

function line(coordinates: Vect[], style = cutStyle) {
    let path = "M"
    for (let i = 0; i < coordinates.length; i++) {
        const c = coordinates[i]
        path += " "
        if (i == 1) {
            path += "L"
        }
        path += c.x + " " + c.y
    }
    return {
        path: {
            $: {
                d: path,
                ...style
            }
        }
    }
}

function rect(c1: Vect, c2: Vect, width: number): Vect[]{
    const m = c2.sub(c1).rotate(-90).mul(width / 2 / c2.dist(c1))
    const m0 = c2.sub(c1).rotate(90).mul(width / 2 / c2.dist(c1))

    return [c1.add(m), c2.add(m), c2.add(m0), c1.add(m0), c1.add(m)]
}

function teethStarts(start: Vect, end: Vect, width: number, teethWidth: number, nogap: boolean = false): [Vect, Vect][]{
    const vects : [Vect, Vect][] = []
    const d = start.dist(end)
    let iterations = Math.floor(d / (width + teethWidth));

    if(nogap){
        iterations++
    }
    const m = end.sub(start).mul(1 / d);

    for (let j = 0; j < iterations; j++) {
        let segmentStart = start.add(m.mul(j * (width + teethWidth) + teethWidth))
        let segmentStop = start.add(m.mul((j+1) * (width + teethWidth) ));
        vects.push([segmentStart, segmentStop])
    }

    return vects
}

function teeth(coordinates: Vect[], configs: { degrees?: number, reverse?: boolean | false, nogap?: boolean | false, width: number, depth: number, teethWidth?: number }[]): Vect[] {
    const allVects = []
    if(configs.length !== coordinates.length - 1){
        throw "Invalid number of configs, expected "+(coordinates.length - 1)+ " but got "+configs.length
    }
    
    for (let i = 1; i < coordinates.length; i++) {
        let start = coordinates[i - 1]
        let c = coordinates[i]
        let isRev = false;
        const config = configs[i-1]
        if(config === undefined){
            if(i == 1){
                allVects.push(start)
            }
            
            allVects.push(c)
            continue
        }
        
        if (config?.reverse) {
            const x = c
            c = start
            start = x

            isRev = true;
        }

        let vects: Vect[] = []
        const d = start.dist(c)
        const width = config.width
        const teethWidth = config.teethWidth ?? config.width
        const depth = config.depth
        let iterations = Math.floor(d / (width + teethWidth));

        if(config?.nogap){
            iterations++
        }
        const m = c.sub(start).mul(1 / d);

        let degrees = config?.degrees ?? 90;
        if (isRev) {
            degrees = -degrees;
        }
        const p = m.rotate(degrees)

        for (let j = 0; j < iterations; j++) {
            let segmentStart = start.add(m.mul(j * (width + teethWidth)))
            vects.push(segmentStart)
            let segmentStop: Vect;
            segmentStop = start.add(m.mul(j * (width + teethWidth) + width));
            vects.push(segmentStop)
            let perpStart = segmentStop.add(p.mul(depth))
            let perpEnd = perpStart.add(m.mul(teethWidth))
            vects.push(perpStart)
            vects.push(perpEnd)

            if (j + 1 >= iterations || isRev) {
                vects.push(start.add(m.mul((j + 1) * (width + teethWidth))))
            }
        }

        vects.push(c)

        if (isRev) {
            vects.push(c)
            vects.reverse()
        }
        if(config?.nogap){
            
            vects = vects.map(v => v.add(m.mul(-width)))
            vects.splice(vects.length - 1, 4)

        }
        
        if(config?.nogap && isRev){
            vects.splice(0, 2)
        }
        
        allVects.push(...vects)
    }
    return allVects

}


const frontplate_top_length = (150 - 28.5 * 2)
const frontplate_bottom_length = (150 - 21 * 2)

function frontPlate(): Vect[] {
    const front_plate_outline_half: [number, number][] = [
        [21, 215],
        [0, 57],
        [28.5, 0],
        [150 - 28.5, 0],
        [150, 57],
        [150 - 21, 215],
        [21, 215],
    ]
    return front_plate_outline_half.map(([x, y]) => new Vect(x, y))
}

function bottomTriangle(): Vect[] {
    // horizontal line, right, left
    const front_plate_outline_half: [number, number][] = [
        [-28.5, 0],
        [28.5, 0],
        [0, 57],
        [-28.5, 0],
    ]
    return front_plate_outline_half.map(([x, y]) => new Vect(28.5 + x, y))
}


function main(): void {

    const w = 300
    const h = 400
    const svg = {
        $: {
            width: w + "mm", height: h + "mm", version: "1.1", viewBox: "0 0 " + w + " " + h
        }
    }

    function add(item: any): void {
        for (const key of Object.keys(item)) {
            let value = item[key]
            let arr: any[];
            if (Array.isArray(value)) {
                arr = <[]>value;
            } else {
                arr = [value]
            }
            if (svg[key] !== undefined) {
                svg[key].push(...arr)
            } else {
                svg[key] = arr
            }
        }
    }

    //   add(circle(25,80,10))
    //  add(teeth([new Vect(0,50), new Vect(500,50),new Vect(500,500)], 20, 20))
    // add(teeth([new Vect(500,50), new Vect(0,50),new Vect(500,500)], 20, 20))
   // add(line(frontPlate().map(v => v.addxy(5, 5)), black))
    const plateWidth = 3.0
    const width = 3.1;
    const teethWidth= 2.9;
    const depth = 3.0;
   
    add(line(teeth(frontPlate().map(v => v.addxy(25, 70)), [
        undefined,
        undefined,
        {
            // Top
            width,
            teethWidth,
            depth
        },
        undefined,
        undefined,
        {
            // Bottom
            width,
            teethWidth,
            depth
        },
    ])))

    add(line(teeth(
        bottomTriangle(),
        [
            {
                width, teethWidth, depth
            }, // horiz
            undefined, undefined
        ]
    ).map(v => v.addxy(150,70))))//*/

    add(line(teeth(
        bottomTriangle(),
        [
            {
                reverse: true,
                nogap: true,
                width, teethWidth, depth
            }, // horiz
            undefined, undefined
        ]
    ).map(v => v.addxy(150,25))))//*/
    
    const topRect = [new Vect(0,0), new Vect(0,66),  new Vect(93,66), new Vect(93,0), new Vect(0,0)]
    const teethedTopRect = teeth(topRect, [
        undefined,
        {
            width,
            teethWidth,
            depth
        },
        undefined,
        {
            width,
            teethWidth,
            depth
        }
    ])
    add(line(topRect .map(v => v.addxy(54, 0)), black))
    add(line(teethedTopRect.map(v => v.addxy(54,0))))

        /*
    {
    const baseplate_center = new Vect(75,140)
    const baseplate_outer = regularoid(baseplate_center, 5, radiusForRegularoid(5, frontplate_bottom_length + 5))
    const baseplate_connect = regularoid(baseplate_center, 5, radiusForRegularoid(5, frontplate_bottom_length ))
    add(line(baseplate_outer, black))
    add(line(baseplate_connect, black))
    for (let i = 0; i < baseplate_connect.length - 1; i++) {
        const start = baseplate_connect[i]
        const end = baseplate_connect[i+1]
        const teeth = teethStarts(start, end, width, teethWidth)
        for (const [toothStart, toothEnd] of teeth) {
            add(line(rect(toothStart, toothEnd, plateWidth * 1.4)))
        }
    }
    }//*/


    const builder = new xml2js.Builder();
    const xml = builder.buildObject({svg});
    writeFileSync("Generated.svg", xml)

    console.log("Done "+new Date().toISOString())


}

main()
