import { useEffect, useState } from 'react';
import { View, Text, Input } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { sendSmsCode, setPassword } from '@/services/auth';
import { bindPhone, updateProfile } from '@/services/user';
import Icon from '@/components/Icon';
import './index.scss';

export type EditField = 'nickname' | 'phone' | 'password' | null;

interface Props {
  field: EditField;
  nickname: string;
  phone: string;
  onClose: () => void;
  onSaved: (patch: { nickname?: string; phone?: string; hasPassword?: boolean }) => void;
}

const PHONE_RE = /^1\d{10}$/;
// placeholder 颜色（小程序端只认 placeholderStyle，不吃 ::placeholder）
const PLACEHOLDER_STYLE = 'color:#475569';

const TITLES: Record<Exclude<EditField, null>, string> = {
  nickname: '修改昵称',
  phone: '绑定手机号',
  password: '设置登录密码'
};

/**
 * 个人信息编辑抽屉。
 *
 * 为什么不用 Taro.showModal({ editable: true })：那是微信小程序专有能力，
 * Taro H5 的 showModal 既忽略 editable/placeholderText，成功回调也只返回
 * { cancel, confirm }（没有 content）——H5 上点确定永远拿不到用户输入，
 * 昵称与手机号会静默失败。改为页面内自绘抽屉，两端一致。
 *
 * 三处 Input **全部常驻挂载**、只切 display：Taro H5 的 taro-input-core
 * 既不会在节点复用时刷新 type/placeholder，也不渲染首屏之后才挂载的实例
 * （见 CLAUDE.md 陷阱 14，login 页同样处理）。
 */
export default function UserEditSheet({ field, nickname, phone, onClose, onSaved }: Props) {
  const [nameVal, setNameVal] = useState('');
  const [phoneVal, setPhoneVal] = useState('');
  const [codeVal, setCodeVal] = useState('');
  const [pwdVal, setPwdVal] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [saving, setSaving] = useState(false);

  // 每次打开时把输入框填回当前值
  useEffect(() => {
    if (!field) return;
    setNameVal(nickname);
    setPhoneVal(phone);
    setCodeVal('');
    setPwdVal('');
    setSaving(false);
  }, [field, nickname, phone]);

  // 发送验证码倒计时
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const onSendCode = async () => {
    if (countdown > 0) return;
    if (!PHONE_RE.test(phoneVal)) {
      Taro.showToast({ title: '请输入正确的手机号', icon: 'none' });
      return;
    }
    try {
      const res = await sendSmsCode(phoneVal, 'bind');
      if (!res.sent) {
        Taro.showToast({ title: '发送失败，请重试', icon: 'none' });
        return;
      }
      setCountdown(60);
      // 开发/mock 期后端直接下发验证码：自动填入并提示，便于联调
      if (res.devCode) {
        setCodeVal(res.devCode);
        Taro.showToast({ title: `验证码已发送：${res.devCode}`, icon: 'none' });
      } else {
        Taro.showToast({ title: '验证码已发送', icon: 'none' });
      }
    } catch (e: any) {
      Taro.showToast({ title: e?.message || '发送失败，请重试', icon: 'none' });
    }
  };

  const submit = async () => {
    if (saving || !field) return;

    if (field === 'nickname') {
      const name = nameVal.trim();
      if (!name) {
        Taro.showToast({ title: '昵称不能为空', icon: 'none' });
        return;
      }
      setSaving(true);
      try {
        const saved = await updateProfile({ nickname: name });
        onSaved({ nickname: saved.nickname ?? name });
        Taro.showToast({ title: '已更新', icon: 'success' });
        onClose();
      } catch (e: any) {
        // 后端已给出「昵称过长」等具体原因，直接透传，别一律说“保存失败”
        Taro.showToast({ title: e?.message || '保存失败', icon: 'none' });
      } finally {
        setSaving(false);
      }
      return;
    }

    if (field === 'phone') {
      if (!PHONE_RE.test(phoneVal)) {
        Taro.showToast({ title: '请输入正确的手机号', icon: 'none' });
        return;
      }
      if (!codeVal.trim()) {
        Taro.showToast({ title: '请输入验证码', icon: 'none' });
        return;
      }
      setSaving(true);
      try {
        const bound = await bindPhone(phoneVal, codeVal.trim());
        onSaved({ phone: bound });
        Taro.showToast({ title: '绑定成功', icon: 'success' });
        onClose();
      } catch (e: any) {
        // 如「该手机号已被其他账号绑定」「验证码错误」
        Taro.showToast({ title: e?.message || '绑定失败', icon: 'none' });
      } finally {
        setSaving(false);
      }
      return;
    }

    // password
    if (pwdVal.length < 6) {
      Taro.showToast({ title: '密码至少 6 位', icon: 'none' });
      return;
    }
    setSaving(true);
    try {
      await setPassword(pwdVal);
      onSaved({ hasPassword: true });
      Taro.showToast({ title: '密码已设置', icon: 'success' });
      onClose();
    } catch (e: any) {
      Taro.showToast({ title: e?.message || '设置失败', icon: 'none' });
    } finally {
      setSaving(false);
    }
  };

  const show = (f: Exclude<EditField, null>) => ({
    display: field === f ? undefined : 'none'
  });

  return (
    <View
      className="edit-mask"
      style={{ display: field ? undefined : 'none' }}
      onClick={onClose}
    >
      <View className="edit-sheet" onClick={(e) => e.stopPropagation()}>
        <View className="edit-sheet__head">
          <Text className="edit-sheet__title">{field ? TITLES[field] : ''}</Text>
          <View className="edit-sheet__close" onClick={onClose}>
            <Icon name="x" size={28} color="#94a3b8" strokeWidth={2} />
          </View>
        </View>

        {/* 昵称 */}
        <View className="edit-sheet__field" style={show('nickname')}>
          <Input
            className="edit-sheet__input"
            maxlength={32}
            placeholder="输入新昵称"
            placeholderStyle={PLACEHOLDER_STYLE}
            confirmType="done"
            value={nameVal}
            onInput={(e) => setNameVal(e.detail.value)}
            onConfirm={submit}
          />
        </View>

        {/* 手机号 + 验证码 */}
        <View style={show('phone')}>
          <View className="edit-sheet__field">
            <Input
              className="edit-sheet__input"
              type="number"
              maxlength={11}
              placeholder="请输入手机号"
              placeholderStyle={PLACEHOLDER_STYLE}
              confirmType="next"
              value={phoneVal}
              onInput={(e) => setPhoneVal(e.detail.value)}
            />
          </View>
          <View className="edit-sheet__field edit-sheet__field--row">
            <Input
              className="edit-sheet__input edit-sheet__input--flex"
              type="number"
              maxlength={6}
              placeholder="请输入验证码"
              placeholderStyle={PLACEHOLDER_STYLE}
              confirmType="done"
              value={codeVal}
              onInput={(e) => setCodeVal(e.detail.value)}
              onConfirm={submit}
            />
            <View
              className={`edit-sheet__code-btn ${countdown > 0 ? 'edit-sheet__code-btn--disabled' : ''}`}
              onClick={onSendCode}
            >
              <Text className="edit-sheet__code-btn-text">
                {countdown > 0 ? `${countdown}s 后重发` : '发送验证码'}
              </Text>
            </View>
          </View>
        </View>

        {/* 密码 */}
        <View className="edit-sheet__field" style={show('password')}>
          <Input
            className="edit-sheet__input"
            password
            maxlength={32}
            placeholder="至少 6 位，用于手机号登录"
            placeholderStyle={PLACEHOLDER_STYLE}
            confirmType="done"
            value={pwdVal}
            onInput={(e) => setPwdVal(e.detail.value)}
            onConfirm={submit}
          />
        </View>

        <View
          className={`edit-sheet__action ${saving ? 'edit-sheet__action--disabled' : ''}`}
          onClick={submit}
        >
          <Text className="edit-sheet__action-text">{saving ? '保存中…' : '保存'}</Text>
        </View>
      </View>
    </View>
  );
}
