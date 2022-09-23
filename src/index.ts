import { ExifImage, type ExifData } from 'exif'
import sharp from 'sharp'
import path from 'path'
import fs from 'fs'
import Fraction from 'fraction.js'

const ORIGINAL_IMAGES_PATH = 'images/original/'
const OUTPUT_IMAGES_PATH = 'images/output/'

const convertExposureTimeToFraction = (exposureTime: number | undefined) => {
  if (exposureTime === undefined) {
    return undefined
  }
  if (exposureTime > 0.3) {
    return `${exposureTime}"`
  } else {
    return new Fraction(exposureTime).toFraction() + 's'
  }
}

const extractExif = (filePath: string): Promise<ExifData> => {
  return new Promise((resolve, reject) => {
    new ExifImage({ image: filePath }, function (err, data) {
      if (err) {
        reject(err)
      }
      resolve(data)
    })
  })
}

const createLabelImage = async (labelText: string): Promise<Buffer> => {
  const margin = 10
  const padding = 32

  const fontSize = 70
  const width = labelText.length * (fontSize / 2) + padding + margin
  const height = fontSize * 1.2 + margin

  const svgImage = `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <style>
      .title { fill: #eee; font-size: ${fontSize}px; font-family: Inconsolata, Osaka; opacity: 0.6 }
      </style>
      <rect
        x="0"
        y="0"
        width="${width - margin}"
        height="${height - margin}"
        fill="#333"
        fill-opacity="0.3"
      ></rect>
      <text
        x="${(width - margin) / 2}"
        y="${fontSize / 1.1}"
        text-anchor="middle"
        class="title"
      >
        ${labelText}
      </text>
    </svg>
    `
  const svgBuffer = Buffer.from(svgImage)
  return svgBuffer
}

const extractSettingInfo = (exifData: ExifData): string => {
  const { FNumber, FocalLength, ISO, ExposureTime } = exifData.exif

  const focalLength = FocalLength && `${FocalLength}mm`
  const fNumber = FNumber && `F${FNumber}`
  const exposureTime =
    ExposureTime !== undefined &&
    `${convertExposureTimeToFraction(ExposureTime)}`
  const iso = ISO !== undefined && `ISO ${ISO}`

  const settingsInfo = [focalLength, fNumber, exposureTime, iso]
    .filter((item) => !!item)
    .join(', ')

  return settingsInfo
}

const extractLensInfo = (exifData: ExifData): string => {
  const { LensModel, LensMake } = exifData.exif

  const lensInfo = [LensMake, LensModel]
    .filter((i) => !!i && i !== '----')
    .join(' ')

  return lensInfo
}

const extractCameraInfo = (exifData: ExifData): string => {
  const { Make, Model } = exifData.image
  let cameraInfo: string
  if (Make && Model) {
    return (cameraInfo = `${Make} ${Model}`)
  }
  if (Make) {
    return Make
  }
  if (Model) {
    return Model
  }
  return ''
}

const makeLabel = (exifData: ExifData): string => {
  const settingsInfo = extractSettingInfo(exifData)
  const lensInfo = extractLensInfo(exifData)
  const cameraInfo = extractCameraInfo(exifData)

  let labelText = ''
  if (settingsInfo) {
    labelText = settingsInfo
    if (cameraInfo || lensInfo) {
      labelText += ' by '
    }
  }
  if (cameraInfo) {
    labelText += cameraInfo
  }
  if (lensInfo) {
    if (cameraInfo) {
      labelText += `, ${lensInfo}`
    } else {
      labelText += lensInfo
    }
  }
  return labelText
}

const main = async () => {
  const imageFiles = fs
    .readdirSync(path.resolve(ORIGINAL_IMAGES_PATH))
    .filter((imageFile) =>
      ['.jpg', '.jpeg'].includes(path.extname(imageFile).toLowerCase())
    )

  fs.mkdirSync(OUTPUT_IMAGES_PATH, { recursive: true })

  for (const imageFile of imageFiles) {
    const imagePath = path.resolve(ORIGINAL_IMAGES_PATH, imageFile)
    const exifData = await extractExif(imagePath)
    const labelText = makeLabel(exifData)
    const labelImageBuffer = await createLabelImage(labelText)
    await sharp(imagePath)
      .withMetadata()
      .composite([
        {
          input: labelImageBuffer,
          gravity: 'southeast',
        },
      ])
      .rotate()
      .toFile(path.resolve(OUTPUT_IMAGES_PATH, imageFile))
    console.log(imageFile, labelText)
  }
}

try {
  main()
} catch (error) {
  console.error(error)
}
