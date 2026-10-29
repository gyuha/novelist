import { HealthStatus } from "../components/health-status";

export default function HomePage() {
	return (
		<>
			<h1 className="page-title">홈</h1>
			<HealthStatus />
		</>
	);
}
