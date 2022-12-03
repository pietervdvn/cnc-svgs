import * as xml2js from "xml2js"
import {writeFileSync} from "fs";

const foldStyle = {
    stroke: "#ff0000",
    "stroke-width": "0.001mm",
    style: "fill:none;stroke-width:1"
}

const cutStyle = {
    stroke: "#000000",
    "stroke-width": "0.001mm",
    style: "fill:none;stroke-width:1.5"
}


const debugStyle = {
    stroke: "#33ff00",
    "stroke-width": "0.001mm",
    style: "fill:none;stroke-width:3"
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
                    ...foldStyle
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

/**
 * Calculates how long an edge is for a regularoid with n edges
 * @param n
 * @param radius
 */
function edgeLengthForRegularoid(n: number, radius: number) {
    // radius = length / (Math.sin(Math.PI / n) * 2)
    // radius * (Math.sin(Math.PI / n) * 2) = length
    return radius * (Math.sin(Math.PI / n) * 2)
}

/**
 * Length of the line which is perpendicular to an edge and goes to the center
 */
function regularoidDistanceFromCenterToEdge(n: number, radius: number): number {
    return radius * Math.cos(Math.PI / n)
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
            center.add(up.rotate((degrees / 2) - i * degrees))
        )
    }

    return points;
}

function line(coordinates: Vect[], style = foldStyle) {
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

function alongLine(a: Vect, b: Vect, distance: number) {
    return b.sub(a).normalize().mul(distance).add(a)
}

function rect(c1: Vect, c2: Vect, width: number, center: boolean = true): Vect[] {
    let m = c2.sub(c1).rotate(-90).mul(width / 2 / c2.dist(c1))
    let m0 = c2.sub(c1).rotate(90).mul(width / 2 / c2.dist(c1))

    if (!center) {
        m = c2.sub(c1).rotate(90).mul(width / c2.dist(c1))
        m0 = new Vect(0, 0)
    }


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

interface TeethConfig {
    degrees?: number,
    reverse?: boolean | false,
    nogap?: boolean | false,
    width: number,
    depth: number,
    teethWidth?: number
}

function teeth(coordinates: Vect[], configs: (TeethConfig | undefined) []): Vect[] {
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

class SvgGeneratorBase {
    public readonly svg

    constructor(canvasWidth: number, canvasHeight: number,
    ) {
        this.svg = {
            $: {
                width: canvasWidth + "mm",
                height: canvasHeight + "mm",
                version: "1.1",
                viewBox: "0 0 " + canvasWidth + " " + canvasHeight
            }
        }


    }

    public asXml(): string {
        const builder = new xml2js.Builder();
        return builder.buildObject({svg: this.svg});
    }

    protected add(item: any): void {
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
}


class PiltoverLantern extends SvgGeneratorBase {

    private readonly plateWidth: any
    private readonly width = 3.1;
    private readonly teethWidth = 2.9;
    private readonly depth = 3.0;
    private readonly crownConnectWidth = 5.0
    private readonly smallHoleSizeRadius = 7.5
    private centralCircleRadius: number;
    private readonly papercraft: boolean;


    constructor(canvasWidth: number, canvasHeight: number, centralCircleRadius: number,
                mode: "printOnce" | "print5",
                options?: {

                    plateWidth?: 3 | number, papercraft?: false | boolean
                }
    ) {
        super(canvasWidth, canvasHeight)
        this.centralCircleRadius = centralCircleRadius;
        this.plateWidth = options?.plateWidth ?? 3
        this.papercraft = options?.papercraft ?? false;

        const baseplateLength = 150 - 21 * 2
        const topplateLength = 93
        const ltop = this.crownPlateLength(topplateLength)
        const lbottom = this.crownPlateLength(baseplateLength)

        if (mode === "print5") {
            this.addTopRect(new Vect(28.5, 0))
            this.addMainPlate(new Vect(0, 64 - this.depth))
            this.addTriangles(new Vect(28.5 + 93, 6))
            this.addCrownPlate(50, lbottom, 8, new Vect(180, 0))
            this.addCrownPlate(50, ltop, 8, new Vect(180, 60))
        } else {
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

    private addEndPlate(l: any, offset: Vect) {
        const r = radiusForRegularoid(5, l)
        this.add(line(regularoid(new Vect(r, r).add(offset), 5, r)))
        this.add(circle(new Vect(r, r).add(offset), this.smallHoleSizeRadius))
    }

    private crownPlateLength(crownplateBaselength): number {
        const crownsize = Math.sin(Math.PI * 2 / 5)
        const baseplate_crown = regularoid(new Vect(0, 0), 5, radiusForRegularoid(5, crownplateBaselength - 10))
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

    private teeth(coordinates: Vect[], configs: (TeethConfig | undefined) []): Vect[] {
        if (this.papercraft) {
            return coordinates
        }
        return teeth(coordinates, configs)
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
        this.add(line(this.teeth(topplate_outer, [config, config, config, config, config])))
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

        this.add(line(this.teeth(
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

        this.add(line(this.teeth(
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
        const teethedTopRect = this.teeth(topRect, [
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

        this.add(line(this.teeth(frontPlate, [
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

const globalOffset = new Vect(10, 62)

class CardboardSettings {
    numberOfSides = 5
    // In mm
    baseDiameter: number = 70
    midDiameter: number = 100
    // Length from the baseplate to the midcrown, measured vertically. The length of the plate will thus be longer, as it bulges out (unless baseDiameter = midDiameter, then they'll be the same)
    baseToMidHeight: number = 125
    topDiameter: number = 75
    midToTopHeight: number = 50
    minirectWidth: number = 15
    crownHeight: number = 40;
}

class CardboardPlate extends SvgGeneratorBase {
    private readonly _options: CardboardSettings;

    constructor(canvasWidth: number, canvasHeight: number, options: CardboardSettings) {
        super(canvasWidth, canvasHeight);
        this._options = options;

        this.addFoldablePlates()
    }

    private addFoldablePlates() {
        const options = this._options
        const bottomPlate = this.generateFrontPlateBottom()
        const fronttopPlate = this.generateFrontPlateTop()
        const crownBase = this.crownBase()
        const crownPlate = this.crownPlate()
        const d = this.plateRotation()
        const mid_width = edgeLengthForRegularoid(options.numberOfSides, options.midDiameter)

        let turnPoint = new Vect(-mid_width, 0)
        for (let i = 0; i < options.numberOfSides; i++) {
            turnPoint = turnPoint.add(new Vect(mid_width, 0))

            const move: (v: Vect) => Vect = (v: Vect) => {
                return v.rotate(-i * d).add(turnPoint).add(globalOffset)
            }

            this.add(line(bottomPlate.map(move)))
            this.add(line(fronttopPlate.map(move)))
            this.add(line(crownBase.map(move)))
            this.add(line(crownPlate.map(move)))

            {
                // Add flaps to crownPlate
                const a = crownPlate[1]
                const b = crownPlate[2]
                const a_opp = crownPlate[3]
                const b_opp = crownPlate[0]
                this.add(line(
                    rect(
                        a,
                        b,
                        5,
                        false
                    ).map(move)))

                this.add(line(
                    [alongLine(a, b, 5), alongLine(b, a, 5)].map(move),
                    cutStyle))

                this.add(line(rect(
                    alongLine(a_opp, b_opp, 6),
                    alongLine(b_opp, a_opp, 6),
                    10, false).map(move), cutStyle))
            }


            if (i + 1 == options.numberOfSides) {
                const w = this._options.minirectWidth
                const topPlate = this.topPlate();
                const offset = new Vect(0, -w)
                this.add(line(topPlate.map(v => move(v.add(offset)))))

                for (let j = 0; j < options.numberOfSides; j++) {
                    if (j == 0) {
                        continue
                    }

                    const a = topPlate[j]
                    const b = topPlate[(j + 1) % topPlate.length]

                    // Add flaps to insert
                    this.add(line(rect(
                        alongLine(a, b, 11),
                        alongLine(b, a, 11),
                        10,
                        false
                    ).map(v => move(v.add(offset))), cutStyle))
                }
            } else {
                // add a side flap
                const a = crownPlate[2];
                const b = crownPlate[3];
                this.add(line(rect(a, b, 5, false).map(move)))
                this.add(line(
                    [alongLine(a, b, 10),
                        alongLine(b, a, 10)].map(move), cutStyle))
            }


            if (i == 1) {
                const bottomPlate = this.bottomPlate()
                this.add(line(bottomPlate.map(v => move(v))))

                for (let j = 0; j < options.numberOfSides; j++) {
                    if(j == 0){
                        continue
                    }
                    const a = bottomPlate[j]
                    const b = bottomPlate[(j + 1) % bottomPlate.length]
                    this.add(line(
                        rect(
                            alongLine(a, b, 16),
                            alongLine(b, a, 16), 
                            15, false
                        ).map(move)
                    ))
                }
            } else {
                // add a side flap
                const a = bottomPlate[2]
                const b = bottomPlate[3]
                this.add(line(rect(
                    alongLine(a, b, 5), alongLine(b, a, 5), 5, false).map(move)))


                this.add(line(
                    [alongLine(a, b, 15), alongLine(b, a, 15)].map(move), cutStyle))


            }

            turnPoint = turnPoint.rotate(-d)
        }
    }

    /**
     * Generates how much the base-plate must be rotated, in degrees
     * @private
     */
    private plateRotation(): number {
        const options = this._options
        const height = this.bottomPlateHeight();
        const mid_width = edgeLengthForRegularoid(options.numberOfSides, options.midDiameter)
        const width = (mid_width - edgeLengthForRegularoid(options.numberOfSides, options.baseDiameter))
        return Math.atan(width / height) * 180 / Math.PI
    }

    private crownWidth(): number {
        const options = this._options
        const crownRadius = options.topDiameter - options.minirectWidth
        return edgeLengthForRegularoid(options.numberOfSides, crownRadius)
    }

    private crownBase(): Vect[] {
        const options = this._options
        const mid_width = edgeLengthForRegularoid(options.numberOfSides, options.midDiameter)
        const center_x = mid_width / 2
        const top_width = edgeLengthForRegularoid(options.numberOfSides, options.topDiameter)
        const crown_width = this.crownWidth()
        const yOffset = this.topPlateHeight()
        return [
            new Vect(center_x + top_width / 2, 0),
            new Vect(center_x - top_width / 2, 0),
            new Vect(center_x - crown_width / 2, -options.minirectWidth),
            new Vect(center_x + crown_width / 2, -options.minirectWidth),
            new Vect(center_x + top_width / 2, 0)
        ].map(v => v.addxy(0, -yOffset))
    }

    private crownPlate(): Vect[] {
        const options = this._options
        const crownRadius = options.topDiameter - options.minirectWidth
        const crown_width = edgeLengthForRegularoid(options.numberOfSides, crownRadius)
        const mid_width = edgeLengthForRegularoid(options.numberOfSides, options.midDiameter)
        const center_x = mid_width / 2
        const yOffset = this.topPlateHeight() + options.minirectWidth
        return [
            new Vect(center_x + crown_width / 2, 0),
            new Vect(center_x - crown_width / 2, 0),
            new Vect(center_x - crown_width / 2, -options.crownHeight),
            new Vect(center_x + crown_width / 2, -options.crownHeight),
            new Vect(center_x + crown_width / 2, 0)
        ].map(v => v.addxy(0, -yOffset))
    }

    private topPlate(): Vect[] {
        const options = this._options
        const crownRadius = options.topDiameter - options.minirectWidth
        const yOffset = this.topPlateHeight() + options.crownHeight + regularoidDistanceFromCenterToEdge(options.numberOfSides, crownRadius)
        const xOffset = edgeLengthForRegularoid(options.numberOfSides, options.midDiameter) / 2

        const offset = new Vect(xOffset, -yOffset)
        let plate = regularoid(new Vect(0, 0), this._options.numberOfSides, crownRadius)

        // Rotate 180° the plate: top line will always be horizontal
        plate = plate.map(v => v.rotate(180).add(offset))

        return plate
    }


    private bottomPlate(): Vect[] {
        const options = this._options
        const yOffset = this.bottomPlateHeight() + regularoidDistanceFromCenterToEdge(options.numberOfSides, options.baseDiameter)
        const xOffset = edgeLengthForRegularoid(options.numberOfSides, options.midDiameter) / 2

        const offset = new Vect(xOffset, yOffset)
        let plate = regularoid(new Vect(0, 0), this._options.numberOfSides, this._options.baseDiameter)

        // Rotate 180° the plate: top line will always be horizontal
        plate = plate.map(v => v.add(offset))

        return plate
    }

    private bottomPlateHeight(): number {
        const options = this._options
        /*

A -------- B
         |
         |
         |
 D------ C
         |
         |
         |
         |
         F
We have: A the edge of the mid rim
D: the edge of the baseplate-rim
B - C - F: the center axis
We know: A - B = options.midDiameter
 D - C = options.baseDiameter     
 B -> C = options.baseToMidHeight
 We need to know: A - D, as this is the height for bottom_y
 We can act as if D-C has length 0, by subtracting it's length from A-B, then applying sinus rules
 
*/
        const AB = options.midDiameter - options.baseDiameter
        const BC = options.baseToMidHeight
        const degrees = Math.atan(AB / BC) // Degrees in D
        return BC / Math.cos(degrees)
    }

    private topPlateHeight(): number {
        const options = this._options
        const AB = options.topDiameter - options.midDiameter
        const BC = options.midToTopHeight
        const degrees = Math.atan(AB / BC) // Degrees in D
        return BC / Math.cos(degrees)
    }

    private generateFrontPlateTop(): Vect[] {
        const options = this._options
        const mid_width = edgeLengthForRegularoid(options.numberOfSides, options.midDiameter)
        const center_x = mid_width / 2
        const top_width = edgeLengthForRegularoid(options.numberOfSides, options.topDiameter)
        const height = this.topPlateHeight()
        return [
            new Vect(0, 0),
            new Vect(mid_width, 0),
            new Vect(center_x + top_width / 2, -height),
            new Vect(center_x - top_width / 2, -height),
            new Vect(0, 0)
        ]
    }

    /**
     * Generates a trapezium serving as the bottom-plate.
     * Zero-point= upper-left
     * @private
     */
    private generateFrontPlateBottom(): Vect[] {
        const options = this._options
        const mid_width = edgeLengthForRegularoid(options.numberOfSides, options.midDiameter)
        const bottom_center_x = mid_width / 2
        const bottom_y = this.bottomPlateHeight();
        return [
            new Vect(0, 0), // Top left
            new Vect(mid_width, 0), // Top right
            new Vect(bottom_center_x + edgeLengthForRegularoid(options.numberOfSides, options.baseDiameter) / 2, bottom_y), // Bottom right
            new Vect(bottom_center_x - edgeLengthForRegularoid(options.numberOfSides, options.baseDiameter) / 2, bottom_y),
            new Vect(0, 0)
        ]
    }
}

function main(): void {


    const a4 = <CardboardSettings>{
        numberOfSides: 5,
        baseDiameter: 35,
        midDiameter: 47,
        baseToMidHeight: 70,
        topDiameter: 40,
        midToTopHeight: 25,
        minirectWidth: 10,
        crownHeight: 20
    }


    const cardboard = new CardboardPlate(397, 210, a4)
    writeFileSync("cardboard.svg", cardboard.asXml())
    console.log("Written cardboard.svg")
    /*
        const sketch = new PiltoverLantern(300, 400, 113 / 2, "printOnce", {
            papercraft: true
        })
        writeFileSync("GeneratedOnce.svg", sketch.asXml())
        const sketch5 = new PiltoverLantern(800, 400, 113 / 2, "print5", {
            papercraft: true
        })
        writeFileSync("Generated5.svg", sketch5.asXml())*/
    console.log("Done " + new Date().toISOString())
}

main()
