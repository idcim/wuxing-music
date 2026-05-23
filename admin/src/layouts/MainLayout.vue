<template>
  <el-container class="layout">
    <el-aside width="220px" class="layout__aside">
      <div class="layout__logo">五行律音</div>
      <el-menu :default-active="route.path" router class="layout__menu" background-color="#0a0e1a"
        text-color="#94a3b8" active-text-color="#fff">
        <el-menu-item index="/dashboard"><el-icon><DataLine /></el-icon><span>仪表盘</span></el-menu-item>
        <el-menu-item index="/tracks"><el-icon><Headset /></el-icon><span>歌曲管理</span></el-menu-item>
        <el-menu-item index="/elements"><el-icon><MagicStick /></el-icon><span>五行管理</span></el-menu-item>
        <el-menu-item index="/plans"><el-icon><Goods /></el-icon><span>套餐管理</span></el-menu-item>
        <el-menu-item index="/cdkeys"><el-icon><Ticket /></el-icon><span>兑换码</span></el-menu-item>
        <el-menu-item index="/quiz"><el-icon><EditPen /></el-icon><span>测评管理</span></el-menu-item>
        <el-menu-item index="/orders"><el-icon><List /></el-icon><span>订单管理</span></el-menu-item>
        <el-menu-item index="/users"><el-icon><User /></el-icon><span>用户</span></el-menu-item>
        <el-menu-item index="/site"><el-icon><HomeFilled /></el-icon><span>站点设置</span></el-menu-item>
        <el-menu-item index="/storage"><el-icon><FolderOpened /></el-icon><span>存储设置</span></el-menu-item>
        <el-menu-item index="/settings"><el-icon><Setting /></el-icon><span>支付设置</span></el-menu-item>
      </el-menu>
    </el-aside>
    <el-container>
      <el-header class="layout__header">
        <span class="layout__title">{{ route.meta.title || '' }}</span>
        <el-dropdown @command="onCommand">
          <span class="layout__user">
            {{ auth.nickname || '管理员' }}<el-icon><ArrowDown /></el-icon>
          </span>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="logout">退出登录</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </el-header>
      <el-main class="layout__main">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

function onCommand(cmd: string) {
  if (cmd === 'logout') {
    auth.logout();
    router.push('/login');
  }
}
</script>

<style scoped>
.layout { height: 100vh; }
.layout__aside { background: #0a0e1a; }
.layout__logo {
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 18px;
  letter-spacing: 3px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}
.layout__menu { border-right: none; }
.layout__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #fff;
  border-bottom: 1px solid #eee;
}
.layout__title { font-size: 16px; font-weight: 500; }
.layout__user { cursor: pointer; display: flex; align-items: center; gap: 4px; color: #555; }
.layout__main { background: #f5f7fa; }
</style>
