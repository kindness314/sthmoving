import cloud from 'wx-server-sdk'

export type MiniProgramEnvironment = 'develop' | 'trial' | 'release'

export interface GenerateMiniProgramCodeInput {
  page: 'pages/item-detail/index'
  scene: string
  environment: MiniProgramEnvironment
}

export interface MiniProgramCodeGenerator {
  generate(input: GenerateMiniProgramCodeInput): Promise<Buffer>
}

export interface LabelFileStorage {
  upload(
    itemId: string,
    publicCode: string,
    content: Buffer,
  ): Promise<string>
}

export class WeChatMiniProgramCodeGenerator
  implements MiniProgramCodeGenerator
{
  async generate(input: GenerateMiniProgramCodeInput): Promise<Buffer> {
    const result = await cloud.openapi['wxacode'].getUnlimited({
      page: input.page,
      scene: input.scene,
      checkPath: input.environment === 'release',
      envVersion: input.environment,
      width: 1280,
      autoColor: false,
      lineColor: { r: 0, g: 0, b: 0 },
      isHyaline: false,
    })
    return extractMiniProgramCodeBuffer(result)
  }
}

export function extractMiniProgramCodeBuffer(result: unknown): Buffer {
  if (
    typeof result !== 'object' ||
    result === null ||
    !('buffer' in result) ||
    !Buffer.isBuffer(result.buffer)
  ) {
    throw new Error('微信接口未返回小程序码图片')
  }
  return result.buffer
}

export class CloudLabelFileStorage implements LabelFileStorage {
  async upload(
    itemId: string,
    publicCode: string,
    content: Buffer,
  ): Promise<string> {
    const result = await cloud.uploadFile({
      cloudPath: `labels/${itemId}/${publicCode}.png`,
      fileContent: content,
    })
    return result.fileID
  }
}
