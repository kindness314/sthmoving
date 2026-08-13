import { describe, expect, it } from 'vitest'

import type { MembershipRepository } from '../../cloudfunctions/api/src/membership/repository'
import type { JoinRequestRecord } from '../../cloudfunctions/api/src/membership/types'
import {
  createJoinRequest,
  createUser,
  type RepositoryHarness,
} from './support'

function pendingRequestsAt(times: string[]): JoinRequestRecord[] {
  return times.map((time, index) =>
    createJoinRequest(
      `join-request-${String(index).padStart(2, '0')}`,
      `applicant-${String(index).padStart(2, '0')}`,
      { created_at: time },
    ),
  )
}

function hourlyTimes(count: number): string[] {
  return Array.from(
    { length: count },
    (_, index) => `2026-07-30T${String(index).padStart(2, '0')}:00:00.000Z`,
  )
}

export function describeMembershipRepositoryContract(
  harness: RepositoryHarness<MembershipRepository>,
): void {
  describe(`MembershipRepository 契约（${harness.name}）`, () => {
    it('统计所有者时只计入所有者角色', async () => {
      const repository = await harness.create({
        users: [
          createUser('user-owner-1', { role: 'OWNER' }),
          createUser('user-admin-1', { role: 'ADMIN' }),
          createUser('user-member-1', { role: 'MEMBER' }),
          createUser('user-manager', { role: 'MANAGER' }),
          createUser('user-member'),
        ],
      })

      await expect(
        repository.runTransaction((unitOfWork) => unitOfWork.countOwners()),
      ).resolves.toBe(1)
    })

    it('没有所有者时统计结果为 0', async () => {
      const repository = await harness.create({
        users: [
          createUser('user-manager', { role: 'MANAGER' }),
          createUser('user-member'),
        ],
      })

      await expect(
        repository.runTransaction((unitOfWork) => unitOfWork.countOwners()),
      ).resolves.toBe(0)
    })

    it('统计管理者时只计入已通过审核的管理者', async () => {
      const repository = await harness.create({
        users: [
          createUser('user-manager-1', { role: 'MANAGER', status: 'APPROVED' }),
          createUser('user-manager-2', { role: 'MANAGER', status: 'APPROVED' }),
          createUser('user-manager-3', { role: 'MANAGER', status: 'DISABLED' }),
          createUser('user-owner', { role: 'OWNER' }),
          createUser('user-admin', { role: 'ADMIN' }),
          createUser('user-member'),
        ],
      })

      await expect(
        repository.runTransaction((unitOfWork) => unitOfWork.countManagers()),
      ).resolves.toBe(2)
    })

    it('管理者数量超过一百时仍返回真实数量', async () => {
      const repository = await harness.create({
        users: Array.from({ length: 120 }, (_, index) =>
          createUser(`user-manager-${String(index).padStart(3, '0')}`, {
            role: 'MANAGER',
            status: 'APPROVED',
          }),
        ),
      })

      await expect(
        repository.runTransaction((unitOfWork) => unitOfWork.countManagers()),
      ).resolves.toBe(120)
    })

    it('只返回指定申请人待审核的申请', async () => {
      const repository = await harness.create({
        joinRequests: [
          createJoinRequest('join-request-rejected', 'applicant-1', {
            status: 'REJECTED',
            created_at: '2026-07-30T01:00:00.000Z',
          }),
          createJoinRequest('join-request-approved', 'applicant-1', {
            status: 'APPROVED',
            created_at: '2026-07-30T02:00:00.000Z',
          }),
          createJoinRequest('join-request-pending', 'applicant-1', {
            created_at: '2026-07-30T03:00:00.000Z',
          }),
          createJoinRequest('join-request-other', 'applicant-2'),
        ],
      })

      await expect(
        repository.runTransaction((unitOfWork) =>
          unitOfWork.findPendingJoinRequest('applicant-1'),
        ),
      ).resolves.toMatchObject({
        _id: 'join-request-pending',
        applicant_id: 'applicant-1',
        status: 'PENDING',
      })
    })

    it('申请人只有已审核的历史记录时不返回待审核申请', async () => {
      const repository = await harness.create({
        joinRequests: [
          createJoinRequest('join-request-rejected', 'applicant-1', {
            status: 'REJECTED',
          }),
          createJoinRequest('join-request-approved', 'applicant-1', {
            status: 'APPROVED',
          }),
          createJoinRequest('join-request-other', 'applicant-2'),
        ],
      })

      await expect(
        repository.runTransaction((unitOfWork) =>
          unitOfWork.findPendingJoinRequest('applicant-1'),
        ),
      ).resolves.toBeNull()
      await expect(
        repository.runTransaction((unitOfWork) =>
          unitOfWork.findPendingJoinRequest('applicant-missing'),
        ),
      ).resolves.toBeNull()
    })

    it('按 ID 读取申请且不存在时返回 null', async () => {
      const repository = await harness.create({
        joinRequests: [createJoinRequest('join-request-1', 'applicant-1')],
      })

      await expect(
        repository.runTransaction((unitOfWork) =>
          unitOfWork.getJoinRequest('join-request-1'),
        ),
      ).resolves.toMatchObject({
        _id: 'join-request-1',
        applicant_id: 'applicant-1',
        requested_role: 'MEMBER',
        status: 'PENDING',
      })
      await expect(
        repository.runTransaction((unitOfWork) =>
          unitOfWork.getJoinRequest('join-request-missing'),
        ),
      ).resolves.toBeNull()
    })

    it('待审核申请列表不包含已审核的申请', async () => {
      const repository = await harness.create({
        joinRequests: [
          createJoinRequest('join-request-pending', 'applicant-1'),
          createJoinRequest('join-request-approved', 'applicant-2', {
            status: 'APPROVED',
          }),
          createJoinRequest('join-request-rejected', 'applicant-3', {
            status: 'REJECTED',
          }),
        ],
      })

      const records = await repository.runTransaction((unitOfWork) =>
        unitOfWork.listPendingJoinRequests(10),
      )

      expect(records.map((record) => record._id)).toEqual([
        'join-request-pending',
      ])
    })

    it('待审核申请按创建时间倒序返回', async () => {
      const repository = await harness.create({
        joinRequests: pendingRequestsAt([
          '2026-07-30T01:00:00.000Z',
          '2026-07-30T03:00:00.000Z',
          '2026-07-30T02:00:00.000Z',
        ]),
      })

      const records = await repository.runTransaction((unitOfWork) =>
        unitOfWork.listPendingJoinRequests(10),
      )

      expect(records.map((record) => record._id)).toEqual([
        'join-request-01',
        'join-request-02',
        'join-request-00',
      ])
    })

    it('创建时间完全相同时按 ID 倒序作为次级排序', async () => {
      const repository = await harness.create({
        joinRequests: pendingRequestsAt(
          Array.from({ length: 5 }, () => '2026-07-30T04:00:00.000Z'),
        ),
      })

      const records = await repository.runTransaction((unitOfWork) =>
        unitOfWork.listPendingJoinRequests(10),
      )

      expect(records.map((record) => record._id)).toEqual([
        'join-request-04',
        'join-request-03',
        'join-request-02',
        'join-request-01',
        'join-request-00',
      ])
    })

    it('待审核申请的 limit 截断发生在排序之后', async () => {
      const repository = await harness.create({
        joinRequests: pendingRequestsAt(hourlyTimes(12)),
      })

      const records = await repository.runTransaction((unitOfWork) =>
        unitOfWork.listPendingJoinRequests(5),
      )

      expect(records.map((record) => record._id)).toEqual([
        'join-request-11',
        'join-request-10',
        'join-request-09',
        'join-request-08',
        'join-request-07',
      ])
    })

    it('列出用户时包含各种状态且两次调用顺序一致', async () => {
      const repository = await harness.create({
        users: [
          createUser('user-a', { created_at: '2026-07-30T01:00:00.000Z' }),
          createUser('user-b', {
            status: 'PENDING',
            created_at: '2026-07-30T03:00:00.000Z',
          }),
          createUser('user-c', {
            status: 'DISABLED',
            created_at: '2026-07-30T03:00:00.000Z',
          }),
          createUser('user-d', {
            status: 'REJECTED',
            created_at: '2026-07-30T02:00:00.000Z',
          }),
        ],
      })

      const first = await repository.runTransaction((unitOfWork) =>
        unitOfWork.listUsers(10),
      )
      const second = await repository.runTransaction((unitOfWork) =>
        unitOfWork.listUsers(10),
      )

      expect(first.map((record) => record._id).sort()).toEqual([
        'user-a',
        'user-b',
        'user-c',
        'user-d',
      ])
      expect(second.map((record) => record._id)).toEqual(
        first.map((record) => record._id),
      )
    })

    it('列出用户时 limit 限制返回数量且不重复', async () => {
      const repository = await harness.create({
        users: Array.from({ length: 6 }, (_, index) =>
          createUser(`user-${String(index).padStart(2, '0')}`),
        ),
      })

      const records = await repository.runTransaction((unitOfWork) =>
        unitOfWork.listUsers(3),
      )

      expect(records).toHaveLength(3)
      expect(new Set(records.map((record) => record._id)).size).toBe(3)
    })

    it('读取用户且不存在时返回 null', async () => {
      const repository = await harness.create({
        users: [
          createUser('user-1', { display_name: '甲', role: 'ADMIN' }),
        ],
      })

      await expect(
        repository.runTransaction((unitOfWork) => unitOfWork.getUser('user-1')),
      ).resolves.toMatchObject({
        _id: 'user-1',
        openid: 'openid-user-1',
        display_name: '甲',
        role: 'ADMIN',
        status: 'APPROVED',
      })
      await expect(
        repository.runTransaction((unitOfWork) =>
          unitOfWork.getUser('user-missing'),
        ),
      ).resolves.toBeNull()
    })

    it('写入用户后可读回全部字段', async () => {
      const repository = await harness.create({
        users: [createUser('user-owner')],
      })

      await repository.runTransaction((unitOfWork) =>
        unitOfWork.setUser(
          createUser('user-1', {
            display_name: '乙',
            avatar_url: 'https://example.com/avatar.png',
            gender: 'FEMALE',
            theme: 'TEAL',
            role: 'MANAGER',
            status: 'APPROVED',
            joined_at: '2026-07-31T00:00:00.000Z',
            reviewed_by: 'user-owner',
            reviewed_at: '2026-07-31T00:00:00.000Z',
          }),
        ),
      )

      await expect(
        repository.runTransaction((unitOfWork) => unitOfWork.getUser('user-1')),
      ).resolves.toMatchObject({
        _id: 'user-1',
        openid: 'openid-user-1',
        display_name: '乙',
        avatar_url: 'https://example.com/avatar.png',
        gender: 'FEMALE',
        theme: 'TEAL',
        role: 'MANAGER',
        status: 'APPROVED',
        joined_at: '2026-07-31T00:00:00.000Z',
        reviewed_by: 'user-owner',
        reviewed_at: '2026-07-31T00:00:00.000Z',
      })
    })

    it('缺失的可选字段读回后为不存在或 null', async () => {
      const repository = await harness.create()

      await repository.runTransaction((unitOfWork) =>
        unitOfWork.setUser(createUser('user-1')),
      )
      const record = await repository.runTransaction((unitOfWork) =>
        unitOfWork.getUser('user-1'),
      )

      expect(record).toMatchObject({
        _id: 'user-1',
        role: 'MEMBER',
        status: 'APPROVED',
      })
      expect(record?.avatar_url ?? null).toBeNull()
      expect(record?.joined_at ?? null).toBeNull()
      expect(record?.reviewed_by ?? null).toBeNull()
    })

    it('事务提交后写入可见', async () => {
      const repository = await harness.create({
        users: [createUser('user-1', { status: 'PENDING' })],
      })

      await repository.runTransaction(async (unitOfWork) => {
        const user = await unitOfWork.getUser('user-1')
        await unitOfWork.setUser({
          ...user!,
          role: 'ADMIN',
          status: 'APPROVED',
        })
        await unitOfWork.setJoinRequest(
          createJoinRequest('join-request-new', 'user-1', {
            status: 'APPROVED',
            approved_role: 'ADMIN',
          }),
        )
      })

      await expect(
        repository.runTransaction((unitOfWork) => unitOfWork.getUser('user-1')),
      ).resolves.toMatchObject({ role: 'ADMIN', status: 'APPROVED' })
      await expect(
        repository.runTransaction((unitOfWork) =>
          unitOfWork.getJoinRequest('join-request-new'),
        ),
      ).resolves.toMatchObject({
        status: 'APPROVED',
        approved_role: 'ADMIN',
      })
    })

    it('事务抛出异常时全部写入回滚', async () => {
      const repository = await harness.create({
        users: [createUser('user-1'), createUser('applicant-2')],
        joinRequests: [createJoinRequest('join-request-1', 'applicant-1')],
      })

      await expect(
        repository.runTransaction(async (unitOfWork) => {
          const user = await unitOfWork.getUser('user-1')
          await unitOfWork.setUser({ ...user!, role: 'OWNER' })
          await unitOfWork.setUser(
            createUser('user-new', { role: 'MANAGER' }),
          )
          const request = await unitOfWork.getJoinRequest('join-request-1')
          await unitOfWork.setJoinRequest({ ...request!, status: 'APPROVED' })
          await unitOfWork.setJoinRequest(
            createJoinRequest('join-request-new', 'applicant-2'),
          )
          throw new Error('模拟事务失败')
        }),
      ).rejects.toThrow('模拟事务失败')

      await expect(
        repository.runTransaction((unitOfWork) => unitOfWork.getUser('user-1')),
      ).resolves.toMatchObject({ role: 'MEMBER' })
      await expect(
        repository.runTransaction((unitOfWork) =>
          unitOfWork.getUser('user-new'),
        ),
      ).resolves.toBeNull()
      await expect(
        repository.runTransaction((unitOfWork) =>
          unitOfWork.getJoinRequest('join-request-1'),
        ),
      ).resolves.toMatchObject({ status: 'PENDING' })
      await expect(
        repository.runTransaction((unitOfWork) =>
          unitOfWork.getJoinRequest('join-request-new'),
        ),
      ).resolves.toBeNull()
      await expect(
        repository.runTransaction((unitOfWork) => unitOfWork.countOwners()),
      ).resolves.toBe(0)
    })

    it('事务内可读到本事务尚未提交的写入', async () => {
      const repository = await harness.create({
        users: [createUser('user-1', { status: 'PENDING' })],
      })

      const seen = await repository.runTransaction(async (unitOfWork) => {
        const user = await unitOfWork.getUser('user-1')
        await unitOfWork.setUser({ ...user!, status: 'APPROVED' })
        await unitOfWork.setJoinRequest(
          createJoinRequest('join-request-new', 'user-1'),
        )
        return {
          user: await unitOfWork.getUser('user-1'),
          request: await unitOfWork.getJoinRequest('join-request-new'),
        }
      })

      expect(seen.user).toMatchObject({ status: 'APPROVED' })
      expect(seen.request).toMatchObject({
        _id: 'join-request-new',
        status: 'PENDING',
      })
    })
  })
}
