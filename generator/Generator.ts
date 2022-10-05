import * as xml2js from "xml2js"
import {writeFileSync} from "fs";

const cutStyle = {
    stroke: "#ff0000",
    "stroke-width": "0.001mm",
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

    public dist(to?: Vect): number {
        return Math.sqrt(
            Math.pow(this.x - (to?.x ?? 0), 2) +
            Math.pow(this.y - (to?.y ?? 0), 2)
        )
    }

    public translate(): Vect {
        return new Vect(this.y, this.x)
    }

    public normalize(): Vect {
        return this.mul(1 / this.dist())
    }

    public rotate(degrees: number): Vect {
        const cos = Math.cos(degrees * Math.PI / 180);
        const sin = Math.sin(degrees * Math.PI / 180);
        const x = (cos * this.x) + (sin * this.y)
        const y = (cos * this.y) - (sin * this.x)
        return new Vect(x, y)
    }
}

function circle(center: Vect, radius: number): any {
    if (radius <= 0) {
        return undefined
    }
    return {
        circle:
            {
                $: {
                    cx: center.x, cy: center.y, r: radius,
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
function radiusForRegularoid(n: number, length: number) {
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
    return length / (Math.sin(Math.PI / n) * 2)
}

function regularoid(center: Vect, n: number, radius: number): Vect[] {

    if (radius < 1) {
        throw "This is a very small radius: " + radius
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

function rect(c1: Vect, c2: Vect, width: number): Vect[] {
    const m = c2.sub(c1).rotate(-90).mul(width / 2 / c2.dist(c1))
    const m0 = c2.sub(c1).rotate(90).mul(width / 2 / c2.dist(c1))

    return [c1.add(m), c2.add(m), c2.add(m0), c1.add(m0), c1.add(m)]
}

function teethStarts(start: Vect, end: Vect, width: number, teethWidth: number, nogap: boolean = false): [Vect, Vect][] {
    const vects: [Vect, Vect][] = []
    const d = start.dist(end)
    let iterations = Math.floor(d / (width + teethWidth));

    if (nogap) {
        iterations++
    }
    const m = end.sub(start).mul(1 / d);

    for (let j = 0; j < iterations; j++) {
        let segmentStart = start.add(m.mul(j * (width + teethWidth) + teethWidth))
        let segmentStop = start.add(m.mul((j + 1) * (width + teethWidth)));
        vects.push([segmentStart, segmentStop])
    }

    return vects
}

interface TeethConfig { degrees?: number, reverse?: boolean | false, nogap?: boolean | false, width: number, depth: number, teethWidth?: number }

function teeth(coordinates: Vect[], configs:(TeethConfig | undefined) []): Vect[] {
    const allVects = []
    if (configs.length !== coordinates.length - 1) {
        throw "Invalid number of configs, expected " + (coordinates.length - 1) + " but got " + configs.length
    }

    for (let i = 1; i < coordinates.length; i++) {
        let start = coordinates[i - 1]
        let c = coordinates[i]
        let isRev = false;
        const config = configs[i - 1]
        if (config === undefined) {
            if (i == 1) {
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

        if (config?.nogap) {
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
        if (config?.nogap) {

            vects = vects.map(v => v.add(m.mul(-width)))
            vects.splice(vects.length - 1, 4)

        }

        if (config?.nogap && isRev) {
            vects.splice(0, 2)
        }

        allVects.push(...vects)
    }
    return allVects

}


class PiltoverLantern {

    private readonly svg: any

    private readonly plateWidth: any
    private readonly width = 3.1;
    private readonly teethWidth = 2.9;
    private readonly depth = 3.0;
    private readonly crownConnectWidth = 5.0
    private readonly smallHoleSizeRadius = 7.5
    private centralCircleRadius: number;

    constructor(canvasWidth: number, canvasHeight: number, centralCircleRadius: number,
                mode : "printOnce" | "print5",
                plateWidth: number = 3) {
        this.centralCircleRadius = centralCircleRadius;
        this.plateWidth = plateWidth
        this.svg = {
            $: {
                width: canvasWidth + "mm",
                height: canvasHeight + "mm",
                version: "1.1",
                viewBox: "0 0 " + canvasWidth + " " + canvasHeight
            }
        }

        const baseplateLength = 150 - 21 * 2
        const topplateLength = 93
        const ltop = this.crownPlateLength(topplateLength)
        const lbottom = this.crownPlateLength(baseplateLength)
         
        if(mode === "print5"){
            this.addTopRect(new Vect(28.5, 0))
            this.addMainPlate(new Vect(0, 64 - this.depth))
            this.addTriangles(new Vect(28.5 + 93, 6))
            this.addCrownPlate(50, lbottom, 8, new Vect(180, 0))
            this.addCrownPlate(50, ltop, 8, new Vect(180, 60))
        }else{
            this.addBaseplate(new Vect(0, 0), baseplateLength)
            this.addTopPlate(new Vect(0, 200), topplateLength)
            
            this.addEndPlate(lbottom, new Vect(200, 0))
            this.addEndPlate(ltop, new Vect(200, 200))

        }
    }

    public asXml(): string {
        const builder = new xml2js.Builder();
        return builder.buildObject({svg: this.svg});
    }

    private addEndPlate(l:any, offset: Vect) {
        const r = radiusForRegularoid(5, l)
        this.add(line(regularoid(new Vect(r, r).add(offset), 5, r)))
        this.add(circle(new Vect(r, r).add(offset), this.smallHoleSizeRadius))
    }
    
    private crownPlateLength(crownplateBaselength): number{
        const crownsize = Math.sin(Math.PI * 2 / 5)
        const baseplate_crown = regularoid(new Vect(0,0), 5, radiusForRegularoid(5, crownplateBaselength - 10))
        const crown_start = baseplate_crown[0]
        const crown_end = baseplate_crown[1]
        const rot = crown_end.sub(crown_start).normalize()
        const start = crown_start.add(rot.mul(crownsize))
        const end = crown_end.sub(rot.mul(crownsize))
        return start.dist(end)
    }

    private addCrownPlate(h: number, w: number, cornerRound: number, offset: Vect) {
        const outline = [
            [cornerRound, 0],
            [w - cornerRound, 0],
            [w, cornerRound],
            [w, h + this.plateWidth],
            [w - this.crownConnectWidth, h + this.plateWidth],
            [w - this.crownConnectWidth, h],
            [this.crownConnectWidth, h],
            [this.crownConnectWidth, h + this.plateWidth],
            [0, h + this.plateWidth],
            [0, cornerRound],
            [cornerRound, 0]
        ]
        this.add(line(outline.map(([x, y]) => new Vect(x, y).add(offset))))
    }

    private addTopPlate(offset: Vect,
                        top_length: number) {
        const r = radiusForRegularoid(5, top_length)
        const baseplate_center = offset.addxy(r, r)
        const topplate_outer = regularoid(baseplate_center, 5, r)
        const baseplate_crown = regularoid(baseplate_center, 5, radiusForRegularoid(5, top_length - 10))
        const config = {
            width: this.width, teethWidth: this.teethWidth, depth: this.plateWidth * 1.5,
            reverse: false,
            noGap: true
        }
        this.add(line(teeth(topplate_outer, [config, config, config, config, config])))
        this.add(circle(baseplate_center, this.centralCircleRadius))
        const crownsize = Math.sin(Math.PI * 2 / 5)
        for (let i = 0; i < 5; i++) {
            const crown_start = baseplate_crown[i]
            const crown_end = baseplate_crown[i + 1]
            const rot = crown_end.sub(crown_start).normalize()
            this.add(line(rect(crown_start.add(rot.mul(crownsize)), crown_start.add(rot.mul(crownsize + this.crownConnectWidth)), this.plateWidth)))
            this.add(line(rect(crown_end.sub(rot.mul(crownsize)), crown_end.sub(rot.mul(crownsize + this.crownConnectWidth)), this.plateWidth)))
        }

        const crown_start = baseplate_crown[0]
        const crown_end = baseplate_crown[1]
        const rot = crown_end.sub(crown_start).normalize()
        const start = crown_start.add(rot.mul(crownsize))
        const end = crown_end.sub(rot.mul(crownsize))
        return start.dist(end)

    }

    /**
     *
     * @param offset
     * @param bottom_length
     * @private
     * @returns the width that the crown plate should be
     */
    private addBaseplate(
        offset: Vect,
        bottom_length: number
    ) {
        const r = radiusForRegularoid(5, bottom_length + 5)
        const baseplate_center = offset.addxy(r, r)
        const baseplate_outer = regularoid(baseplate_center, 5, r)
        const baseplate_connect = regularoid(baseplate_center, 5, radiusForRegularoid(5, bottom_length + 0.1)) // + 0.1, as rounding ate one hole
        const baseplate_crown = regularoid(baseplate_center, 5, radiusForRegularoid(5, bottom_length - 10))
        this.add(line(baseplate_outer))
        this.add(circle(baseplate_center, this.centralCircleRadius))
        const crownsize = Math.sin(Math.PI * 2 / 5)
        for (let i = 0; i < 5; i++) {
            const start = baseplate_connect[i]
            const end = baseplate_connect[i + 1]
            let teeth = teethStarts(start, end, this.width, this.teethWidth)

            for (const [toothStart, toothEnd] of teeth) {
                this.add(line(rect(toothStart, toothEnd, this.plateWidth * 1.4)))
            }

            const crown_start = baseplate_crown[i]
            const crown_end = baseplate_crown[i + 1]
            const rot = crown_end.sub(crown_start).normalize()
            this.add(line(rect(crown_start.add(rot.mul(crownsize)), crown_start.add(rot.mul(crownsize + this.crownConnectWidth)), this.plateWidth)))
            this.add(line(rect(crown_end.sub(rot.mul(crownsize)), crown_end.sub(rot.mul(crownsize + this.crownConnectWidth)), this.plateWidth)))
        }
    }

    private addTriangles(offset: Vect) {

        const bottomTriangle: Vect[] = [
            [-28.5, 0],
            [28.5, 0],
            [0, 57],
            [-28.5, 0],
        ].map(([x, y]) => new Vect(28.5 + x, y))

        this.add(line(teeth(
            bottomTriangle,
            [
                {
                    reverse: true,
                    nogap: true,
                    width: this.width, teethWidth: this.teethWidth, depth: this.depth
                }, // horiz
                undefined, undefined
            ]
        ).map(v => v.rotate(180).add(offset).addxy(57, 57))))

        this.add(line(teeth(
            bottomTriangle,
            [
                {
                    width: this.width, teethWidth: this.teethWidth, depth: this.depth
                }, // horiz
                undefined, undefined
            ]
        ).map(v => v.addxy(0, 60).add(offset))))
    }

    private addTopRect(offset: Vect) {
        const topRect = [new Vect(0, 0), new Vect(0, 66), new Vect(93, 66), new Vect(93, 0), new Vect(0, 0)]
        const teethedTopRect = teeth(topRect, [
            undefined,
            {
                width: this.width,
                teethWidth: this.teethWidth,
                depth: this.depth,
            },
            undefined,
            {
                width: this.width,
                teethWidth: this.teethWidth,
                depth: this.depth,
            }
        ])
        this.add(line(teethedTopRect.map(v => v.add(offset))))
    }

    private add(item: any): void {
        if (item === undefined) {
            return
        }

        for (const key of Object.keys(item)) {
            let value = item[key]
            let arr: any[];
            if (Array.isArray(value)) {
                arr = <[]>value;
            } else {
                arr = [value]
            }
            if (this.svg[key] !== undefined) {
                this.svg[key].push(...arr)
            } else {
                this.svg[key] = arr
            }
        }
    }

    private addMainPlate(offset: Vect) {

        const frontPlate = [
            [21, 215],
            [0, 57],
            [28.5, 0],
            [150 - 28.5, 0],
            [150, 57],
            [150 - 21, 215],
            [21, 215],
        ].map(([x, y]) => new Vect(x, y + 5).add(offset))

        this.add(line(teeth(frontPlate, [
            undefined,
            undefined,
            {
                // Top
                width: this.width,
                teethWidth: this.teethWidth,
                depth: this.depth
            },
            undefined,
            undefined,
            {
                // Bottom
                width: this.width,
                teethWidth: this.teethWidth,
                depth: this.depth
            },
        ])))
    }
}


function main(): void {
    const sketch = new PiltoverLantern(300, 400, 113/2, "printOnce", 3)
    writeFileSync("GeneratedOnce.svg", sketch.asXml())
    const sketch5 = new PiltoverLantern(800, 400, 113/2, "print5", 3)
    writeFileSync("Generated5.svg", sketch5.asXml())
    console.log("Done " + new Date().toISOString())
}

main()
